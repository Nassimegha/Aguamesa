// src/server/score.test.ts — P3 (Task 2)
// Acceptance core: the same holdMs scores through the pour function with
// no distortion, and a second try on the same glass changes nothing.
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { DailyService } from '../shared/types';
import { MemoryStore } from './memoryStore';
import { glassCrowdKey, poursKey } from './redis';
import { CROWD_MIN_PLAYERS, MAX_HOLD_MS, pourGlass, type PourFn } from './score';

function makeDay(): DailyService {
  const day: DailyService = {
    dayId: '2026-11-24',
    night: 24,
    location: 'cafe',
    glasses: Array.from({ length: 5 }, (_, i) => ({
      model: 'pint',
      line: 0.7,
      flow: 1.0,
      twist: 'none',
      customer: `customer-${i}`,
    })),
  };
  return day;
}

function stubPour(level: number, score: number): { fn: PourFn; calls: () => number } {
  let calls = 0;
  const fn: PourFn = () => {
    calls += 1;
    return { level, score, overflow: false };
  };
  return { fn, calls: () => calls };
}

describe('pourGlass', () => {
  test('first pour records the pour function output undistorted', async () => {
    const store = new MemoryStore();
    const day = makeDay();
    const { fn, calls } = stubPour(0.72, 95);
    const outcome = await pourGlass(
      store,
      day,
      { username: 'nassime', dayId: day.dayId, glassIndex: 2, holdMs: 1500 },
      fn
    );
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.replayed, false);
    assert.equal(outcome.result.score, 95);
    assert.equal(outcome.result.level, 0.72);
    assert.equal(calls(), 1);
  });

  test('replay returns the stored result without recomputing, even with another holdMs', async () => {
    const store = new MemoryStore();
    const day = makeDay();
    const { fn, calls } = stubPour(0.72, 95);
    const input = { username: 'nassime', dayId: day.dayId, glassIndex: 1, holdMs: 1500 };
    const first = await pourGlass(store, day, input, fn);
    const second = await pourGlass(store, day, { ...input, holdMs: 100 }, fn);
    assert.equal(first.ok && second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(second.replayed, true);
    assert.deepEqual(second.result, first.result);
    assert.equal(calls(), 1);
  });

  test('concurrent double pours collapse into a single recorded result', async () => {
    const store = new MemoryStore();
    const day = makeDay();
    const { fn } = stubPour(0.7, 100);
    const input = { username: 'marwa', dayId: day.dayId, glassIndex: 0, holdMs: 1500 };
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => pourGlass(store, day, input, fn))
    );
    assert.ok(outcomes.every((o) => o.ok));
    const results = outcomes.flatMap((o) => (o.ok ? [o.result] : []));
    const first = results[0];
    assert.ok(first !== undefined);
    // Every tap sees the same score, and the crowd counted exactly one pour.
    assert.ok(results.every((r) => JSON.stringify(r) === JSON.stringify(first)));
    const stats = await store.hGetAll(glassCrowdKey(day.dayId, 0));
    assert.equal(stats['count'], '1');
  });

  test('crowd line is seeded from the glass line until 5 other pours', async () => {
    const store = new MemoryStore();
    const day = makeDay();
    const { fn } = stubPour(0.5, 60);
    for (let i = 0; i < CROWD_MIN_PLAYERS - 1; i += 1) {
      const outcome = await pourGlass(
        store,
        day,
        { username: `user-${i}`, dayId: day.dayId, glassIndex: 0, holdMs: 1500 },
        fn
      );
      assert.equal(outcome.ok, true);
      if (outcome.ok) assert.equal(outcome.result.crowdLine, 0.7);
    }
  });

  test('crowd line averages the others and beatPercent counts who did worse', async () => {
    const store = new MemoryStore();
    const day = makeDay();
    const others = stubPour(0.6, 80);
    for (let i = 0; i < CROWD_MIN_PLAYERS; i += 1) {
      await pourGlass(
        store,
        day,
        { username: `user-${i}`, dayId: day.dayId, glassIndex: 3, holdMs: 1500 },
        others.fn
      );
    }
    const { fn } = stubPour(0.69, 90);
    const outcome = await pourGlass(
      store,
      day,
      { username: 'champion', dayId: day.dayId, glassIndex: 3, holdMs: 1500 },
      fn
    );
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.result.crowdLine, 0.6);
    assert.equal(outcome.result.beatPercent, 100);
  });

  test('a corrupt stored row still answers a valid fresh-looking result', async () => {
    const store = new MemoryStore();
    const day = makeDay();
    await store.hSet(poursKey(day.dayId, 'nassime'), { '0': 'not-json{{{' });
    const { fn } = stubPour(0.7, 100);
    const outcome = await pourGlass(
      store,
      day,
      { username: 'nassime', dayId: day.dayId, glassIndex: 0, holdMs: 1500 },
      fn
    );
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.replayed, true);
    assert.equal(outcome.result.score, 100);
  });

  test('invalid inputs are rejected without writing', async () => {
    const store = new MemoryStore();
    const day = makeDay();
    const { fn, calls } = stubPour(0.7, 100);
    const bad = [
      { username: 'u', dayId: '1999-01-01', glassIndex: 0, holdMs: 1500 },
      { username: 'u', dayId: day.dayId, glassIndex: -1, holdMs: 1500 },
      { username: 'u', dayId: day.dayId, glassIndex: 5, holdMs: 1500 },
      { username: 'u', dayId: day.dayId, glassIndex: 1.5, holdMs: 1500 },
      { username: 'u', dayId: day.dayId, glassIndex: 0, holdMs: -5 },
      { username: 'u', dayId: day.dayId, glassIndex: 0, holdMs: Number.NaN },
      { username: 'u', dayId: day.dayId, glassIndex: 0, holdMs: MAX_HOLD_MS + 1 },
    ];
    for (const input of bad) {
      const outcome = await pourGlass(store, day, input, fn);
      assert.equal(outcome.ok, false);
    }
    assert.equal(calls(), 0);
  });
});

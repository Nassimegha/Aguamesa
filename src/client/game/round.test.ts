// src/client/game/round.test.ts — P1
// Tests the night sequence with a FAKE glass (no 3D) and a FAKE server.

/// <reference types="node" />

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DailyService, GlassSpec, NightSummary, PourRequest, PourResult } from '../../shared/types';
import type { PourOutcome } from './pourSession';
import { RETRY_DELAYS_MS, playNight, playRound, withRetry, type NightApi, type PlayGlass } from './round.ts';

// ------------------------------------------------------------------ helpers

const glass = (customer: string): GlassSpec => ({ model: 'pint', line: 0.7, flow: 1, twist: 'none', customer });

const today: DailyService = {
  dayId: '2026-11-24',
  night: 24,
  location: 'cafe',
  glasses: ['giant', 'fairy', 'ghost', 'giant', 'fairy'].map(glass),
};

/** A fake player: glass i is held 1000 + i ms and scores 90 + i. */
function fakePlayer(log: string[] = []): PlayGlass {
  return async (_spec, index, hooks) => {
    log.push(`play ${index}`);
    hooks.onPourStart();
    const outcome: PourOutcome = { holdMs: 1000 + index, level: 0.7, score: 90 + index, overflow: false };
    return outcome;
  };
}

/** Records every delay instead of really waiting. */
function fakeWait(delays: number[] = []): (ms: number) => Promise<void> {
  return async (ms) => {
    delays.push(ms);
  };
}

const summaryFor = (dayId: string): NightSummary => ({
  dayId, scores: [90, 91, 92, 93, 94], total: 460, tips: 50, streak: 3,
  freezeUsed: false, rank: 1, shareText: 'x',
});

/** A fake server that records requests. */
function fakeApi(overrides: Partial<NightApi> = {}): NightApi & { requests: PourRequest[]; finished: string[] } {
  const requests: PourRequest[] = [];
  const finished: string[] = [];
  return {
    requests,
    finished,
    pour:
      overrides.pour ??
      (async (req) => {
        requests.push(req);
        const result: PourResult = { score: 90 + req.glassIndex, level: 0.7, overflow: false, crowdLine: 0.66, beatPercent: 50 };
        return result;
      }),
    finishNight:
      overrides.finishNight ??
      (async (dayId) => {
        finished.push(dayId);
        return summaryFor(dayId);
      }),
  };
}

// ------------------------------------------------------------------ playRound

test('playRound plays every glass in order and fires the events in order', async () => {
  const events: string[] = [];
  const outcomes = await playRound({
    glasses: today.glasses,
    playGlass: fakePlayer(),
    wait: fakeWait(),
    events: {
      onGlassStart: (i, spec) => events.push(`start ${i} ${spec.customer}`),
      onPourStart: (i) => events.push(`pour ${i}`),
      onPourEnd: (i, o) => events.push(`end ${i} ${o.score}`),
    },
  });
  assert.deepEqual(outcomes.map((o) => o?.score), [90, 91, 92, 93, 94]);
  assert.deepEqual(events.slice(0, 6), ['start 0 giant', 'pour 0', 'end 0 90', 'start 1 fairy', 'pour 1', 'end 1 91']);
  assert.equal(events.length, 15);
});

test('playRound pauses after each pour so the customer can react', async () => {
  const delays: number[] = [];
  await playRound({ glasses: today.glasses.slice(0, 3), playGlass: fakePlayer(), wait: fakeWait(delays), pauseMs: 1234 });
  assert.deepEqual(delays, [1234, 1234, 1234]);
});

// ------------------------------------------------------------------ playNight

test('a full night: 5 pours sent with the right holdMs, then night/finish', async () => {
  const api = fakeApi();
  const ended: NightSummary[] = [];
  const { summary, outcomes, serverResults } = await playNight({
    today,
    api,
    playGlass: fakePlayer(),
    wait: fakeWait(),
    events: { onNightEnd: (s) => ended.push(s) },
  });
  assert.deepEqual(
    api.requests,
    [0, 1, 2, 3, 4].map((i) => ({ dayId: '2026-11-24', glassIndex: i, holdMs: 1000 + i })),
  );
  assert.deepEqual(api.finished, ['2026-11-24']);
  assert.equal(summary.total, 460);
  assert.equal(ended.length, 1);
  assert.equal(outcomes.length, 5);
  assert.ok(serverResults.every((r) => r !== null));
});

test('glasses already played today are skipped (one try per day)', async () => {
  const api = fakeApi();
  const log: string[] = [];
  const skipped: number[] = [];
  const { outcomes } = await playNight({
    today,
    api,
    playGlass: fakePlayer(log),
    playedToday: [true, true, false, false, false],
    wait: fakeWait(),
    events: { onGlassSkipped: (i) => skipped.push(i) },
  });
  assert.deepEqual(log, ['play 2', 'play 3', 'play 4']);
  assert.deepEqual(skipped, [0, 1]);
  assert.deepEqual(api.requests.map((r) => r.glassIndex), [2, 3, 4]);
  assert.equal(outcomes[0], null);
});

test('onPourEnd never waits for the server (latency rule)', async () => {
  let releaseServer!: () => void;
  const serverGate = new Promise<void>((resolve) => (releaseServer = resolve));
  const order: string[] = [];
  const api = fakeApi({
    pour: async (req) => {
      await serverGate; // the server is slow
      order.push(`server ${req.glassIndex}`);
      return { score: 90 + req.glassIndex, level: 0.7, overflow: false, crowdLine: 0.6, beatPercent: 40 };
    },
  });
  const night = playNight({
    today,
    api,
    playGlass: fakePlayer(),
    wait: fakeWait(),
    events: { onPourEnd: (i) => order.push(`end ${i}`) },
  });
  // Let the 5 glasses be played while the server is still blocked.
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.deepEqual(order, ['end 0', 'end 1', 'end 2', 'end 3', 'end 4']);
  releaseServer();
  await night;
  assert.equal(order.filter((o) => o.startsWith('server')).length, 5);
});

test('night/finish is only called after every pour reached the server', async () => {
  const order: string[] = [];
  const api = fakeApi({
    pour: async (req) => {
      await new Promise((r) => setTimeout(r, 5 - req.glassIndex)); // answers in random-ish order
      order.push(`pour ${req.glassIndex}`);
      return { score: 1, level: 0.5, overflow: false, crowdLine: 0.5, beatPercent: 0 };
    },
    finishNight: async (dayId) => {
      order.push('finish');
      return summaryFor(dayId);
    },
  });
  await playNight({ today, api, playGlass: fakePlayer(), wait: fakeWait() });
  assert.equal(order.at(-1), 'finish');
  assert.equal(order.length, 6);
});

test('a failing pour request is retried, then reported without blocking the night', async () => {
  let calls = 0;
  const errors: unknown[] = [];
  const api = fakeApi({
    pour: async (req) => {
      calls++;
      if (req.glassIndex === 1) throw new Error('network down'); // glass 1 always fails
      return { score: 1, level: 0.5, overflow: false, crowdLine: 0.5, beatPercent: 0 };
    },
  });
  const { serverResults, summary } = await playNight({
    today,
    api,
    playGlass: fakePlayer(),
    wait: fakeWait(),
    events: { onError: (e) => errors.push(e) },
  });
  assert.equal(calls, 4 + (1 + RETRY_DELAYS_MS.length)); // 4 good + glass 1 tried 3 times
  assert.equal(errors.length, 1);
  assert.equal(serverResults[1], null);
  assert.equal(summary.dayId, today.dayId); // the night still finished
});

test('if night/finish keeps failing, playNight rejects', async () => {
  const api = fakeApi({
    finishNight: async () => {
      throw new Error('server down');
    },
  });
  await assert.rejects(playNight({ today, api, playGlass: fakePlayer(), wait: fakeWait() }), /server down/);
});

// ------------------------------------------------------------------ withRetry

test('withRetry: succeeds on the 3rd try after waiting 500 then 1500 ms', async () => {
  let attempts = 0;
  const delays: number[] = [];
  const value = await withRetry(async () => {
    attempts++;
    if (attempts < 3) throw new Error('flaky');
    return 'ok';
  }, fakeWait(delays));
  assert.equal(value, 'ok');
  assert.deepEqual(delays, [500, 1500]);
});

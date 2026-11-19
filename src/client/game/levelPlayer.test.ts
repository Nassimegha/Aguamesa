// src/client/game/levelPlayer.test.ts — P1
// Levels mode: level files, validation, stars.

/// <reference types="node" />

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import type { Level, PlayerState } from '../../shared/types';
import { holdMsForLevel, pour } from '../../shared/pour.ts';
import { parseLevel, playLevel, starsFor } from './levelPlayer.ts';
import type { PlayGlass } from './round.ts';

const LEVELS_DIR = new URL('../../../levels/', import.meta.url);
const levelFiles = readdirSync(LEVELS_DIR).filter((f) => f.endsWith('.json'));

const noWait = async (): Promise<void> => {};

const sampleLevel: Level = {
  id: 'cafe-test',
  location: 'cafe',
  glasses: [
    { model: 'pint', line: 0.7, flow: 1, twist: 'none', customer: 'giant' },
    { model: 'flute', line: 0.6, flow: 1, twist: 'none', customer: 'fairy' },
    { model: 'thimble', line: 0.5, flow: 0.6, twist: 'none', customer: 'ghost' },
  ],
  stars: [150, 210, 255],
};

/** Plays every glass with a hold that lands `offset` away from the line, using the real formula. */
function playerWithOffset(offset: number): PlayGlass {
  return async (spec, _i, hooks) => {
    hooks.onPourStart();
    const holdMs = Math.round(holdMsForLevel(spec, spec.line + offset));
    return { holdMs, holds: [holdMs], ...pour(spec, holdMs) };
  };
}

// ------------------------------------------------------------------ the real level files

test('there is at least cafe-03 in /levels (01 Task 3)', () => {
  assert.ok(levelFiles.includes('cafe-03.json'));
});

for (const file of levelFiles) {
  test(`levels/${file} is a valid level`, () => {
    const json: unknown = JSON.parse(readFileSync(new URL(file, LEVELS_DIR), 'utf8'));
    const level = parseLevel(json, file.replace(/\.json$/, ''));
    // 3 stars must be reachable with perfect pours, and 1 star must need more than luck.
    assert.ok(level.stars[2] <= 100 * level.glasses.length);
    assert.ok(level.stars[0] >= 30 * level.glasses.length, '1★ is too easy');
  });
}

// ------------------------------------------------------------------ stars

test('starsFor counts the thresholds reached', () => {
  const level = { stars: [150, 210, 255] as [number, number, number] };
  assert.equal(starsFor(level, 0), 0);
  assert.equal(starsFor(level, 149), 0);
  assert.equal(starsFor(level, 150), 1);
  assert.equal(starsFor(level, 209), 1);
  assert.equal(starsFor(level, 210), 2);
  assert.equal(starsFor(level, 254), 2);
  assert.equal(starsFor(level, 255), 3);
  assert.equal(starsFor(level, 300), 3);
});

// ------------------------------------------------------------------ validation

test('parseLevel rejects broken level files with a clear message', () => {
  const good = JSON.parse(JSON.stringify(sampleLevel)) as Record<string, unknown>;
  const broken = (patch: Record<string, unknown>): unknown => ({ ...good, ...patch });

  assert.deepEqual(parseLevel(good), sampleLevel);
  assert.throws(() => parseLevel(null), /not an object/);
  assert.throws(() => parseLevel(good, 'cafe-99'), /file name says "cafe-99"/);
  assert.throws(() => parseLevel(broken({ location: 'moon' })), /location/);
  assert.throws(() => parseLevel(broken({ glasses: sampleLevel.glasses.slice(0, 2) })), /3 to 5/);
  assert.throws(() => parseLevel(broken({ stars: [200, 100, 250] })), /go up/);
  assert.throws(() => parseLevel(broken({ stars: [100, 200, 301] })), /≤ 300/);
  assert.throws(() => parseLevel(broken({ stars: [1, 2] })), /3 whole numbers/);
  const badGlass = (g: Record<string, unknown>): unknown =>
    broken({ glasses: [{ ...sampleLevel.glasses[0], ...g }, sampleLevel.glasses[1], sampleLevel.glasses[2]] });
  assert.throws(() => parseLevel(badGlass({ model: 'bucket' })), /glass 0: unknown model/);
  assert.throws(() => parseLevel(badGlass({ line: 1.2 })), /line/);
  assert.throws(() => parseLevel(badGlass({ flow: 0 })), /flow/);
  assert.throws(() => parseLevel(badGlass({ twist: 'lava' })), /twist/);
  assert.throws(() => parseLevel(badGlass({ customer: '' })), /customer/);
});

// ------------------------------------------------------------------ playing a level

test('perfect pours give 3 stars, and the server receives the scores', async () => {
  const sent: { id: string; scores: number[] }[] = [];
  const confirmed: number[] = [];
  const result = await playLevel({
    level: sampleLevel,
    playGlass: playerWithOffset(0),
    wait: noWait,
    api: {
      completeLevel: async (id, scores) => {
        sent.push({ id, scores });
        return { stars: 3, player: {} as PlayerState };
      },
    },
    events: { onServerConfirmed: (stars) => confirmed.push(stars) },
  });
  assert.deepEqual(result, { levelId: 'cafe-test', scores: [100, 100, 100], total: 300, stars: 3 });
  assert.deepEqual(sent, [{ id: 'cafe-test', scores: [100, 100, 100] }]);
  assert.deepEqual(confirmed, [3]);
});

test('the number of stars follows how close the pours are', async () => {
  const starsWith = async (offset: number): Promise<number> =>
    (await playLevel({ level: sampleLevel, playGlass: playerWithOffset(offset), wait: noWait })).stars;
  assert.equal(await starsWith(0.01), 3); // ~98 each
  assert.equal(await starsWith(0.035), 2); // ~80 each
  assert.equal(await starsWith(0.05), 1); // ~66 each
  assert.equal(await starsWith(0.2), 0); // way off
  assert.equal(await starsWith(0.5), 0); // overflow
});

test('the stars show right away, even if the server fails', async () => {
  const shown: number[] = [];
  const errors: unknown[] = [];
  const result = await playLevel({
    level: sampleLevel,
    playGlass: playerWithOffset(0),
    wait: noWait,
    api: {
      completeLevel: async () => {
        throw new Error('offline');
      },
    },
    events: { onLevelEnd: (r) => shown.push(r.stars), onError: (e) => errors.push(e) },
  });
  assert.deepEqual(shown, [3]);
  assert.equal(result.stars, 3);
  assert.equal(errors.length, 1);
});

// src/shared/pour.test.ts — P1
// Run with: npm run test   (Node's built-in test runner, no extra library)

/// <reference types="node" />

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { GlassModel, GlassSpec } from './types';
import {
  DRIP_MS,
  GLASS_PROFILES,
  MAX_HOLD_MS,
  finalLevel,
  holdMsForLevel,
  levelAfter,
  pour,
  scoreFor,
} from './pour.ts';

const MODELS = Object.keys(GLASS_PROFILES) as GlassModel[];

function spec(model: GlassModel, line = 0.7, flow = 1): GlassSpec {
  return { model, line, flow, twist: 'none', customer: 'test' };
}

// ---------------------------------------------------------------- brief: determinism

test('same input gives the same output, 1000 times in a row', () => {
  for (const model of MODELS) {
    for (const holdMs of [0, 1, 500, 1234.5, 1840, 2600, 9999]) {
      const s = spec(model, 0.66, 0.9);
      const first = pour(s, holdMs);
      for (let i = 0; i < 1000; i++) {
        assert.deepEqual(pour(s, holdMs), first);
      }
    }
  }
});

test('pour.ts never uses randomness or the clock', () => {
  const source = readFileSync(new URL('./pour.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove /* block comments */
    .replace(/\/\/.*$/gm, ''); // remove // line comments
  assert.doesNotMatch(source, /Math\.random/);
  assert.doesNotMatch(source, /\bDate\b/);
  assert.doesNotMatch(source, /performance/);
  assert.doesNotMatch(source, /crypto/);
});

// ---------------------------------------------------------------- brief: 100 on the line

test('stopping exactly on the line scores 100, for every glass', () => {
  for (const model of MODELS) {
    for (const line of [0.3, 0.6, 0.78, 0.95]) {
      for (const flow of [0.6, 1, 1.1]) {
        const s = spec(model, line, flow);
        const result = pour(s, holdMsForLevel(s, line));
        assert.equal(result.score, 100, `${model} line=${line} flow=${flow} level=${result.level}`);
        assert.equal(result.overflow, false);
      }
    }
  }
});

// ---------------------------------------------------------------- brief: 0 on overflow

test('overflowing scores 0, sets overflow, and caps level at 1', () => {
  for (const model of MODELS) {
    const s = spec(model, 0.8);
    const result = pour(s, holdMsForLevel(s, 1.05));
    assert.deepEqual(result, { level: 1, score: 0, overflow: true }, model);
  }
});

test('filling exactly to the rim (level 1) is not an overflow', () => {
  const s = spec('pint', 0.998);
  assert.equal(scoreFor(s, 1), 100); // 1 is within 0.005 of the line, and not > 1
  assert.equal(pour(s, holdMsForLevel(s, 1)).overflow, false);
  assert.equal(scoreFor(s, 1.000001), 0);
});

// ---------------------------------------------------------------- score curve

test('score falls smoothly from 99 to 1 as you move away from the line', () => {
  const s = spec('pint', 0.5);
  let previous = 100;
  for (let d = 0.005; d <= 0.5; d += 0.005) {
    for (const level of [0.5 + d, 0.5 - d]) {
      const score = scoreFor(s, level);
      assert.ok(score >= 1 && score <= 99, `d=${d} score=${score}`);
      assert.ok(score <= previous, `score went up at d=${d}`);
    }
    previous = scoreFor(s, 0.5 + d);
  }
  assert.equal(scoreFor(s, 0.0), 1); // way too low
  assert.equal(scoreFor(s, 0.5 + 0.0049), 100); // inside the tolerance
  assert.equal(scoreFor(s, 0.5 - 0.0049), 100);
});

test('score values a good player can feel', () => {
  const s = spec('pint', 0.5);
  assert.equal(scoreFor(s, 0.52), 95); // 2 % off: great
  assert.equal(scoreFor(s, 0.55), 66); // 5 % off: ok
  assert.equal(scoreFor(s, 0.6), 17); // 10 % off: bad
});

test('score is 0 for a broken level value', () => {
  assert.equal(scoreFor(spec('pint'), Number.NaN), 0);
  assert.equal(scoreFor(spec('pint'), Number.POSITIVE_INFINITY), 0);
});

// ---------------------------------------------------------------- fill behaviour

test('holding longer always gives a higher level', () => {
  for (const model of MODELS) {
    const s = spec(model);
    let previous = -1;
    for (let ms = 0; ms <= 4000; ms += 10) {
      const level = finalLevel(s, ms);
      assert.ok(level > previous || (ms === 0 && level === 0), `${model} at ${ms}ms`);
      previous = level;
    }
  }
});

test('higher flow fills faster', () => {
  assert.ok(finalLevel(spec('pint', 0.7, 1.2), 1000) > finalLevel(spec('pint', 0.7, 1), 1000));
  assert.ok(finalLevel(spec('pint', 0.7, 0.6), 1000) < finalLevel(spec('pint', 0.7, 1), 1000));
});

test('a mug fills slower near the top than a flute', () => {
  // Share of the total fill time spent going from 80 % to 100 %.
  const topShare = (model: GlassModel): number => {
    const s = spec(model);
    const toRim = holdMsForLevel(s, 1) + DRIP_MS;
    const to80 = holdMsForLevel(s, 0.8) + DRIP_MS;
    return (toRim - to80) / toRim;
  };
  assert.ok(topShare('mug_giant') > 0.2, 'mug: top 20 % takes more than 20 % of the time');
  assert.ok(topShare('flute') < 0.2, 'flute: top 20 % takes less than 20 % of the time');
  assert.ok(topShare('mug_giant') > topShare('flute'));
});

test('every glass fills to the rim in exactly its fullMs at flow 1', () => {
  for (const model of MODELS) {
    assert.equal(levelAfter(spec(model), GLASS_PROFILES[model].fullMs), 1, model);
  }
});

test('trailing drops add exactly DRIP_MS of pouring after release', () => {
  const s = spec('tankard', 0.8, 1.1);
  for (const ms of [200, 1000, 2000]) {
    assert.equal(finalLevel(s, ms), levelAfter(s, ms + DRIP_MS));
    assert.ok(finalLevel(s, ms) > levelAfter(s, ms));
  }
});

test('the drip is bigger when the flow is bigger (≈ 120 ms × flow)', () => {
  const drip = (flow: number): number => {
    const s = spec('tankard', 0.8, flow);
    return finalLevel(s, 1000) - levelAfter(s, 1000);
  };
  assert.ok(drip(1.2) > drip(1) && drip(1) > drip(0.6));
});

test('holdMsForLevel is the inverse of finalLevel', () => {
  for (const model of MODELS) {
    const s = spec(model, 0.5, 0.8);
    for (const target of [0.2, 0.5, 0.9]) {
      assert.ok(Math.abs(finalLevel(s, holdMsForLevel(s, target)) - target) < 1e-5, `${model} ${target}`);
    }
  }
});

test('matches the §10.2 example: giant mug, 1840 ms → about 0.775', () => {
  const s: GlassSpec = { model: 'mug_giant', line: 0.78, flow: 1.0, twist: 'none', customer: 'giant' };
  const result = pour(s, 1840);
  assert.ok(Math.abs(result.level - 0.775) < 0.01, `level=${result.level}`);
  assert.ok(result.score >= 95, `score=${result.score}`);
});

// ---------------------------------------------------------------- untrusted input

test('bad holdMs from a client is treated safely', () => {
  const s = spec('pint');
  assert.deepEqual(pour(s, 0), { level: 0, score: scoreFor(s, 0), overflow: false });
  assert.equal(finalLevel(s, -500), 0);
  assert.equal(finalLevel(s, Number.NaN), 0);
  assert.equal(finalLevel(s, Number.POSITIVE_INFINITY), 0);
  assert.equal(finalLevel(s, 10 * MAX_HOLD_MS), finalLevel(s, MAX_HOLD_MS));
  assert.equal(pour(s, 10 * MAX_HOLD_MS).overflow, true);
});

test('a broken glass spec throws a clear error', () => {
  assert.throws(() => pour({ ...spec('pint'), model: 'bucket' as GlassModel }, 1000), RangeError);
  assert.throws(() => pour(spec('pint', 0.7, 0), 1000), RangeError);
  assert.throws(() => pour(spec('pint', 0.7, -1), 1000), RangeError);
  assert.throws(() => pour(spec('pint', 1.5), 1000), RangeError);
  assert.throws(() => pour(spec('pint', Number.NaN), 1000), RangeError);
});

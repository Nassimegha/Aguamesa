// src/shared/pour.test.ts — P1
// Run with: npm run test   (Node's built-in test runner, no extra library)

/// <reference types="node" />

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import type { GlassModel, GlassSpec, Twist } from './types';
import {
  DRIP_MS,
  FOAM_HEAD,
  FOAM_MAX,
  GLASS_PROFILES,
  ICE_RISE,
  ICE_TRIGGER_MAX,
  ICE_TRIGGER_MIN,
  LEAK_MAX,
  LEAK_MIN,
  MAX_HOLD_MS,
  TILT_MARGIN,
  finalLevel,
  foamAt,
  holdMsForLevel,
  iceTrigger,
  idealHolds,
  layerLines,
  leakAmount,
  levelAfter,
  overflowLimit,
  pour,
  pourSequence,
  scoreFor,
  twistSeed,
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

// ================================================================ twists (01 Task 4)

const LEVELS_DIR = new URL('../../levels/', import.meta.url);
const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

function twisted(twist: Twist, model: GlassModel = 'pint', line = 0.7, flow = 1, customer = 'test'): GlassSpec {
  return { model, line, flow, twist, customer };
}

test('visual-only twists (spin, steam, hidden_line) use exactly the base formula', () => {
  for (const twist of ['spin', 'steam', 'hidden_line'] as const) {
    for (const model of MODELS) {
      for (const ms of [0, 400, 1500, 2600]) {
        assert.deepEqual(pour(twisted(twist, model), ms), pour(spec(model), ms), `${twist} ${model} ${ms}`);
      }
    }
  }
});

test('twistSeed is deterministic, in [0, 1), and differs between glasses', () => {
  const a = twisted('leak', 'pint', 0.7, 1, 'giant');
  const b = twisted('leak', 'pint', 0.7, 1, 'fairy');
  for (let i = 0; i < 100; i++) assert.equal(twistSeed(a), twistSeed(a));
  assert.notEqual(twistSeed(a), twistSeed(b));
  assert.notEqual(twistSeed(a, 'ice'), twistSeed(a, 'leak'));
  for (const s of [a, b]) assert.ok(twistSeed(s) >= 0 && twistSeed(s) < 1);
});

// ---------------------------------------------------------------- layers

test('layers2 / layers3: lines are evenly spaced up to spec.line', () => {
  assert.deepEqual(layerLines(twisted('none', 'pint', 0.8)), [0.8]);
  assert.deepEqual(layerLines(twisted('layers2', 'pint', 0.8)), [0.4, 0.8]);
  assert.deepEqual(layerLines(twisted('layers3', 'pint', 0.9)), [0.3, 0.6, 0.9]);
});

test('layers: one perfect press per line scores 100; the sum of presses sets the final level', () => {
  for (const twist of ['layers2', 'layers3'] as const) {
    for (const model of MODELS) {
      const s = twisted(twist, model, 0.8);
      const holds = idealHolds(s);
      assert.equal(holds.length, twist === 'layers2' ? 2 : 3);
      const result = pourSequence(s, holds);
      assert.equal(result.score, 100, `${twist} ${model} ${JSON.stringify(result)}`);
      assert.ok(Math.abs(result.level - 0.8) < 0.005);
      // "la somme compte": total poured time = sum of holds + one drip per press.
      const total = holds.reduce((a, b) => a + b, 0) + DRIP_MS * holds.length;
      assert.equal(result.level, levelAfter(s, total));
    }
  }
});

test('layers: missing a layer costs points, overshooting the first layer too', () => {
  const s = twisted('layers2', 'pint', 0.8);
  const [h0, h1] = idealHolds(s) as [number, number];
  assert.equal(pourSequence(s, [h0, h1]).score, 100);
  // Only one press: layer 1 perfect, layer 2 stuck at layer 1's level (0.4 away) → about half.
  assert.ok(pourSequence(s, [h0]).score <= 51);
  // First press too long by 300 ms, then compensated: final level OK but layer 1 was missed.
  const off = pourSequence(s, [h0 + 300, h1 - 300]);
  assert.ok(Math.abs(off.level - 0.8) < 0.005);
  assert.ok(off.score < 100 && off.score > 50, `score ${off.score}`);
  // Overflow on the last layer → 0.
  assert.equal(pourSequence(s, [h0, h1 + 3000]).score, 0);
  assert.equal(pourSequence(s, [h0, h1 + 3000]).overflow, true);
});

test('layers: pour() with a single hold only fills the first layer', () => {
  const s = twisted('layers3', 'pint', 0.9);
  const [h0] = idealHolds(s) as [number];
  const single = pour(s, h0);
  assert.ok(Math.abs(single.level - 0.3) < 0.005);
  assert.ok(single.score < 40); // layers 2 and 3 were never poured
});

// ---------------------------------------------------------------- foam

test('foam: grows fast then is capped at FOAM_MAX; only for the foam twist', () => {
  const s = twisted('foam');
  assert.equal(foamAt(s, 0), 0);
  assert.ok(foamAt(s, 300) > foamAt(s, 100));
  assert.ok(foamAt(s, 10_000) <= FOAM_MAX);
  assert.equal(foamAt(twisted('none'), 1000), 0);
});

test('foam: the settled head counts in the final level', () => {
  const s = twisted('foam');
  assert.equal(finalLevel(s, 1000), round6(finalLevel(spec('pint'), 1000) + FOAM_HEAD));
  assert.equal(pour(s, holdMsForLevel(s, 0.7)).score, 100);
});

test('foam: if the foam goes over the rim it is an overflow, even if the liquid stays below', () => {
  const s = twisted('foam', 'pint', 0.9);
  const hold = holdMsForLevel(s, 0.95); // the final level would be 0.95, under the rim...
  const result = pourSequence(s, [hold]);
  assert.ok(result.level < 1);
  assert.ok(result.peak > 1); // ...but the foam spilled while pouring
  assert.equal(result.overflow, true);
  assert.equal(result.score, 0);
});

// ---------------------------------------------------------------- ice

test('ice: the cube pushes the final level up by ICE_RISE', () => {
  const s = twisted('ice');
  for (const ms of [300, 900, 1500]) {
    assert.equal(finalLevel(s, ms), round6(finalLevel(spec('pint'), ms) + ICE_RISE));
  }
  assert.equal(finalLevel(s, 0), 0); // nothing poured, no ice
  assert.equal(pour(s, holdMsForLevel(s, 0.7)).score, 100);
});

test('ice: the cube falls at a seeded level between ICE_TRIGGER_MIN and MAX', () => {
  const triggers = ['giant', 'fairy', 'ghost', 'a', 'b'].map((c) => iceTrigger(twisted('ice', 'pint', 0.7, 1, c)));
  for (const t of triggers) assert.ok(t >= ICE_TRIGGER_MIN && t <= ICE_TRIGGER_MAX);
  assert.ok(new Set(triggers).size > 1, 'not every glass should drop the ice at the same level');
  assert.equal(iceTrigger(twisted('none')), Number.POSITIVE_INFINITY);
});

// ---------------------------------------------------------------- tilt

test('tilt: the glass spills TILT_MARGIN below the rim', () => {
  const tilted = twisted('tilt', 'pint', 0.9);
  const straight = twisted('none', 'pint', 0.9);
  assert.equal(overflowLimit(tilted), 1 - TILT_MARGIN);
  const hold = holdMsForLevel(straight, 0.97);
  assert.equal(pour(straight, hold).overflow, false);
  assert.equal(pour(tilted, hold).overflow, true);
  assert.equal(pour(tilted, hold).score, 0);
  assert.equal(pour(tilted, holdMsForLevel(tilted, 0.9)).score, 100);
});

// ---------------------------------------------------------------- leak

test('leak: the level drops by a seeded amount between LEAK_MIN and LEAK_MAX', () => {
  for (const customer of ['giant', 'fairy', 'ghost']) {
    const s = twisted('leak', 'tankard', 0.7, 1, customer);
    const leak = leakAmount(s);
    assert.ok(leak >= LEAK_MIN && leak <= LEAK_MAX);
    assert.equal(finalLevel(s, 1500), round6(finalLevel(twisted('none', 'tankard'), 1500) - leak));
    assert.equal(pour(s, holdMsForLevel(s, 0.7)).score, 100);
  }
  assert.equal(leakAmount(twisted('none')), 0);
});

test('leak: overflow is checked BEFORE the leak (it already spilled)', () => {
  const s = twisted('leak', 'pint', 0.9);
  const hold = holdMsForLevel(twisted('none', 'pint'), 1.02);
  const result = pourSequence(s, [hold]);
  assert.ok(result.level < 1);
  assert.equal(result.overflow, true);
});

// ---------------------------------------------------------------- test levels

const testLevelFiles = readdirSync(LEVELS_DIR).filter((f) => f.startsWith('test-') && f.endsWith('.json'));

test('every twist has its levels/test-<twist>.json', () => {
  const twists: Twist[] = ['layers2', 'layers3', 'foam', 'ice', 'spin', 'tilt', 'leak', 'steam', 'hidden_line'];
  for (const twist of twists) assert.ok(testLevelFiles.includes(`test-${twist}.json`), `test-${twist}.json missing`);
});

for (const file of testLevelFiles) {
  test(`levels/${file}: perfect presses score 100 on every glass`, () => {
    const level = JSON.parse(readFileSync(new URL(file, LEVELS_DIR), 'utf8')) as { glasses: GlassSpec[] };
    for (const [i, glassSpec] of level.glasses.entries()) {
      const holds = idealHolds(glassSpec).map((h) => Math.round(h)); // the client sends whole ms
      const result = pourSequence(glassSpec, holds);
      assert.equal(result.score, 100, `glass ${i} ${JSON.stringify(result)}`);
      assert.equal(result.overflow, false);
    }
  });
}

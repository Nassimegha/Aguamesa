// src/server/pourFallback.test.ts — P3 (Task 2)
// Properties of the TEMPORARY fallback (see pourFallback.ts): fully
// deterministic, perfect on the line, zero on overflow. Delete with it
// when P1's pour.ts lands.
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { GlassSpec } from '../shared/types';
import { fallbackPour, fallbackScoreFor } from './pourFallback';

const SPEC: GlassSpec = { model: 'pint', line: 0.7, flow: 1.0, twist: 'none', customer: 'giant' };

describe('pourFallback', () => {
  test('same input gives the same output, 1000 times', () => {
    const first = fallbackPour(SPEC, 1600);
    for (let i = 0; i < 1000; i += 1) {
      assert.deepEqual(fallbackPour(SPEC, 1600), first);
    }
  });

  test('score is 100 on the line', () => {
    assert.equal(fallbackScoreFor(SPEC, 0.7), 100);
    assert.equal(fallbackScoreFor(SPEC, 0.704), 100);
  });

  test('score falls off smoothly and stays within 1..99 off the line', () => {
    const near = fallbackScoreFor(SPEC, 0.75);
    const far = fallbackScoreFor(SPEC, 0.9);
    assert.ok(near > far && far >= 1 && near <= 99);
  });

  test('overflow scores 0 and reports level 1', () => {
    const out = fallbackPour(SPEC, 60_000);
    assert.equal(out.overflow, true);
    assert.equal(out.score, 0);
    assert.equal(out.level, 1);
  });

  test('higher flow fills faster for the same hold', () => {
    const slow = fallbackPour({ ...SPEC, flow: 0.5 }, 1500);
    const fast = fallbackPour({ ...SPEC, flow: 1.5 }, 1500);
    assert.ok(fast.level > slow.level);
  });

  test('negative or absurd holds cannot produce NaN', () => {
    for (const holdMs of [-100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = fallbackPour(SPEC, holdMs);
      assert.ok(Number.isFinite(out.level) && Number.isFinite(out.score));
    }
  });
});

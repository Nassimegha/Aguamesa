// src/server/pourParity.test.ts — P3 (Task 2)
// T2 acceptance, second half: "the same holdMs gives the same score as in
// the client". The client scores with P1's src/shared/pour.ts — which is
// not delivered yet — so this test SKIPS until that file exists, then
// proves the server path adds no distortion on top of pour().
//
// The import specifier is built dynamically on purpose: a static
// '../shared/pour' import would fail the type check before P1 lands.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { DailyService, GlassSpec } from '../shared/types';
import { MemoryStore } from './memoryStore';
import { pourGlass, type PourFn } from './score';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type AnyFn = (...args: unknown[]) => unknown;

function isCallable(value: unknown): value is AnyFn {
  return typeof value === 'function';
}

function isPourOutput(value: unknown): value is { level: number; score: number; overflow: boolean } {
  return (
    isRecord(value) &&
    typeof value['level'] === 'number' &&
    typeof value['score'] === 'number' &&
    typeof value['overflow'] === 'boolean'
  );
}

test('server scoring matches shared/pour once P1 delivers it', async (t) => {
  const file = ['pour'].join('');
  let mod: unknown;
  try {
    mod = await import(`../shared/${file}`);
  } catch {
    t.skip('src/shared/pour.ts not delivered yet (P1, due Nov 20)');
    return;
  }
  if (!isRecord(mod) || !isCallable(mod['pour'])) {
    t.skip('src/shared/pour.ts has no pour() export yet');
    return;
  }
  const rawPour = mod['pour'];
  const pour: PourFn = (spec, holdMs) => {
    const out: unknown = rawPour(spec, holdMs);
    if (!isPourOutput(out)) throw new Error('P1 pour() broke the §7 output shape');
    return out;
  };
  const spec: GlassSpec = { model: 'pint', line: 0.7, flow: 1.0, twist: 'none', customer: 'x' };
  const day: DailyService = { dayId: '2026-11-24', night: 24, location: 'cafe', glasses: [spec] };
  for (const holdMs of [0, 500, 1500, 1840, 3000, 10_000]) {
    const direct = pour(spec, holdMs);
    assert.ok(isPourOutput(direct), 'P1 pour() keeps the §7 output shape');
    const store = new MemoryStore();
    const outcome = await pourGlass(
      store,
      day,
      { username: 'parity', dayId: day.dayId, glassIndex: 0, holdMs },
      pour
    );
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.result.score, direct.score);
    assert.equal(outcome.result.level, direct.level > 1 ? 1 : direct.level);
    assert.equal(outcome.result.overflow, direct.overflow);
  }
});

// src/server/pourFallback.ts — P3 (Task 2)
// ⚠️ TEMPORARY — DELETE THIS FILE when P1 lands `src/shared/pour.ts` (due
// Thu Nov 20, brief 01 T1). Then, in src/server/score.ts, change the
// default pour function from `fallbackPour` to P1's `pour` (same §7
// signature) and delete this file plus pourFallback.test.ts.
//
// Why it exists: Task 2 (server-verified score, demo Sun Nov 23) cannot
// wait for P1's formula. This fallback mirrors the shape of P1's spec
// (brief 01, Task 1.1) so the server logic, the Redis layout and the
// tests are already correct when the real formula arrives:
//   - fill speed scales with `flow`
//   - fixed trailing drips of ~120ms × flow after release
//   - 100 when |level - line| < 0.005, smooth falloff down to 1,
//     0 on overflow (level > 1)
// What it does NOT do (P1's job): per-glass shapes (a pint fills slower
// at the top than a flute) and twist physics. Twists are ignored here.
//
// Deterministic: pure arithmetic, no Math.random, no clock. The same
// (spec, holdMs) always gives the same output — the property the
// anti-cheat design relies on.
import type { GlassSpec } from '../shared/types';

/** Fill rate: 0.42 of the glass per second at flow 1.0. */
const FILL_PER_MS = 0.00042;

/** Trailing drips after release, in ms of extra pouring at flow 1.0. */
const TRAIL_MS = 120;

/** Width of the Gaussian score falloff around the line. */
const SCORE_SIGMA = 0.09;

/** Half-width of the "perfect" band around the line. */
const PERFECT_BAND = 0.005;

export type FallbackPourOutput = {
  level: number;
  score: number;
  overflow: boolean;
};

/** Final level (0..1+) for a hold of holdMs, drips included. Deterministic. */
export function fallbackFinalLevel(spec: GlassSpec, holdMs: number): number {
  const held = Number.isFinite(holdMs) && holdMs > 0 ? holdMs : 0;
  return (held + TRAIL_MS) * FILL_PER_MS * spec.flow;
}

/** Score 0..100 from the final level and the glass line. */
export function fallbackScoreFor(spec: GlassSpec, level: number): number {
  if (!Number.isFinite(level) || level > 1) return 0;
  const distance = Math.abs(level - spec.line);
  if (distance < PERFECT_BAND) return 100;
  const falloff = Math.exp(-((distance / SCORE_SIGMA) ** 2));
  return Math.max(1, Math.round(100 * falloff));
}

/**
 * Temporary stand-in for P1's `pour()` (§7: same name shape, same
 * output). The reported level is clamped to 1: the contract (§6.1) says
 * PourResult.level is 0..1, and `overflow` carries the over-the-rim info.
 */
export function fallbackPour(spec: GlassSpec, holdMs: number): FallbackPourOutput {
  const raw = fallbackFinalLevel(spec, holdMs);
  const overflow = raw > 1;
  const score = overflow ? 0 : fallbackScoreFor(spec, raw);
  return { level: overflow ? 1 : raw, score, overflow };
}

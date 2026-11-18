// src/shared/pour.ts — P1
// The pour formula from contract 00 §7. Used by BOTH the client (animation)
// and the server (authoritative score). Same input => same output, always.
//
// Rules (00 §7, 01 Task 1):
//   - No Math.random(), no Date, no performance.now(): pure arithmetic only.
//   - No runtime imports (only `import type`), so Node, Vite and Devvit can
//     all load this file as-is.
//   - Do NOT change the numbers below after Thu 20 Nov without telling P3:
//     changing them changes every score already stored on the server.
//
// Twists (layers, foam, ice, leak...) are NOT applied yet: they arrive in
// Task 4, each one deterministic. Until then `spec.twist` is ignored here.

import type { GlassModel, GlassSpec } from './types';

// ---------------------------------------------------------------------------
// Glass shapes
// ---------------------------------------------------------------------------

/**
 * How a glass fills.
 *
 * `taper`: how much wider the glass is at the rim than at the bottom.
 *   The radius at height h (0 = bottom, 1 = rim) is `1 + taper * h`.
 *   - taper > 0: wider at the top (mug, goblet): the level rises SLOWER near the top.
 *   - taper = 0: straight cylinder: the level rises at a constant speed.
 *   - taper < 0: narrower at the top (flute, coconut): the level rises FASTER near the top.
 *   Must stay > -1, otherwise the radius would reach zero.
 *
 * `fullMs`: how long it takes to fill the glass exactly to the rim (level 1)
 *   when `flow` is 1.0. Bigger glasses take longer.
 */
export interface GlassProfile {
  readonly taper: number;
  readonly fullMs: number;
}

export const GLASS_PROFILES: Readonly<Record<GlassModel, GlassProfile>> = {
  pint:      { taper: 0.15,  fullMs: 2400 },
  mug_giant: { taper: 0.35,  fullMs: 2700 },
  thimble:   { taper: 0.10,  fullMs: 1400 },
  flute:     { taper: -0.15, fullMs: 2000 },
  coconut:   { taper: -0.25, fullMs: 2600 },
  teacup:    { taper: 0.45,  fullMs: 1800 },
  goblet:    { taper: 0.50,  fullMs: 2200 },
  tankard:   { taper: 0.05,  fullMs: 2600 },
};

// ---------------------------------------------------------------------------
// Tuning constants (frozen after Thu 20 Nov — tell P3 before changing)
// ---------------------------------------------------------------------------

/** After release, drops keep falling: equivalent to this many ms of extra pouring at the current flow. */
export const DRIP_MS = 120;

/** |level - line| strictly below this gives a perfect 100. */
export const PERFECT_TOLERANCE = 0.005;

/** Width of the score curve: about 0.07 away from the line, the score has dropped to ~37. */
export const SCORE_SPREAD = 0.07;

/** Any hold longer than this is treated as this (it overflows every glass anyway). */
export const MAX_HOLD_MS = 30_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Volume (in arbitrary units) contained between the bottom and height h, for a given taper. */
function volumeUpTo(taper: number, h: number): number {
  if (taper === 0) return h;
  const r = 1 + taper * h;
  return (r * r * r - 1) / (3 * taper);
}

/** Inverse of volumeUpTo: the height reached by a given volume. */
function heightForVolume(taper: number, volume: number): number {
  if (taper === 0) return volume;
  return (Math.cbrt(3 * taper * volume + 1) - 1) / taper;
}

/** Rounds to 6 decimals so tiny float differences between JS engines (phone vs server) disappear. */
function quantize(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** Turns untrusted player input into a safe number of milliseconds in [0, MAX_HOLD_MS]. */
function sanitizeHold(holdMs: number): number {
  if (!Number.isFinite(holdMs) || holdMs <= 0) return 0;
  return Math.min(holdMs, MAX_HOLD_MS);
}

/** Throws if the glass spec itself is broken (that is a content bug, not a player mistake). */
function profileFor(spec: GlassSpec): GlassProfile {
  const profile = GLASS_PROFILES[spec.model];
  if (profile === undefined) {
    throw new RangeError(`pour: unknown glass model "${String(spec.model)}"`);
  }
  if (!Number.isFinite(spec.flow) || spec.flow <= 0) {
    throw new RangeError(`pour: flow must be a positive number, got ${spec.flow}`);
  }
  if (!Number.isFinite(spec.line) || spec.line < 0 || spec.line > 1) {
    throw new RangeError(`pour: line must be between 0 and 1, got ${spec.line}`);
  }
  return profile;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Level reached after pouring for `pourMs` milliseconds, WITHOUT the trailing drops.
 * The client calls this every frame while the finger is down to animate the liquid.
 * Can go above 1 (overflow).
 */
export function levelAfter(spec: GlassSpec, pourMs: number): number {
  const { taper, fullMs } = profileFor(spec);
  const t = sanitizeHold(pourMs);
  if (t === 0) return 0;
  // Fraction of a full glass that has been poured (1 = exactly to the rim).
  const fraction = (spec.flow * t) / fullMs;
  const volume = fraction * volumeUpTo(taper, 1);
  return quantize(heightForVolume(taper, volume));
}

/** Final level (0..1+) after a hold of holdMs, trailing drops included. Deterministic. (00 §7) */
export function finalLevel(spec: GlassSpec, holdMs: number): number {
  const t = sanitizeHold(holdMs);
  // A tap of 0 ms pours nothing, so nothing drips either.
  if (t === 0) return 0;
  return levelAfter(spec, t + DRIP_MS);
}

/** Score 0..100 from the final level and the line. (00 §7) */
export function scoreFor(spec: GlassSpec, level: number): number {
  profileFor(spec); // validates the spec
  if (!Number.isFinite(level) || level > 1) return 0; // overflow
  const distance = Math.abs(level - spec.line);
  if (distance < PERFECT_TOLERANCE) return 100;
  const x = (distance - PERFECT_TOLERANCE) / SCORE_SPREAD;
  const score = Math.round(1 + 98 * Math.exp(-x * x));
  return Math.min(99, Math.max(1, score));
}

/** Shortcut for the server. `level` is capped at 1 (the glass cannot hold more); `overflow` says it spilled. (00 §7) */
export function pour(
  spec: GlassSpec,
  holdMs: number,
): { level: number; score: number; overflow: boolean } {
  const level = finalLevel(spec, holdMs);
  const overflow = level > 1;
  return { level: overflow ? 1 : level, score: scoreFor(spec, level), overflow };
}

/**
 * Inverse of finalLevel: how long to hold so that the FINAL level (drops included) is `target`.
 * Used by tests, the tutorial and level tuning. Returns 0 if the drops alone already reach the target.
 */
export function holdMsForLevel(spec: GlassSpec, target: number): number {
  const { taper, fullMs } = profileFor(spec);
  const h = Math.min(Math.max(target, 0), 2); // 2 = well past the rim, enough for any overflow test
  const fraction = volumeUpTo(taper, h) / volumeUpTo(taper, 1);
  const pourMs = (fraction * fullMs) / spec.flow;
  return Math.max(0, pourMs - DRIP_MS);
}

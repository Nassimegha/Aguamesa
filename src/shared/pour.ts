// src/shared/pour.ts — P1
// The pour formula from contract 00 §7. Used by BOTH the client (animation)
// and the server (authoritative score). Same input => same output, always.
//
// Rules (00 §7, 01 Task 1 and Task 4):
//   - No Math.random(), no Date, no performance.now(): pure arithmetic only.
//   - Twists that "look random" (leak amount, when the ice falls) come from a hash of
//     the glass spec itself (twistSeed), so client and server always agree.
//   - No runtime imports (only `import type`), so Node, Vite and Devvit can
//     all load this file as-is.
//   - Do NOT change the numbers below without telling P3: changing them changes
//     every score already stored on the server.
//
// Twists (01 Task 4). Only these change the formula:
//   layers2 / layers3 : 2 or 3 lines, one press per line; score = average of the layers.
//   foam              : foam rises faster than the liquid, then settles to a small head.
//                       If the FOAM goes over the rim, it's an overflow.
//   ice               : an ice cube falls in and pushes the level up by ICE_RISE.
//   tilt              : the boat tilts, so the glass spills a bit BELOW the rim.
//   leak              : after release, the level drops by a fixed (seeded) amount.
// spin, steam and hidden_line are visual only: same formula as 'none'.

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
// Tuning constants (tell P3 before changing)
// ---------------------------------------------------------------------------

/** After release, drops keep falling: equivalent to this many ms of extra pouring at the current flow. */
export const DRIP_MS = 120;

/** |level - line| strictly below this gives a perfect 100. */
export const PERFECT_TOLERANCE = 0.005;

/** Width of the score curve: about 0.07 away from the line, the score has dropped to ~37. */
export const SCORE_SPREAD = 0.07;

/** Any hold longer than this is treated as this (it overflows every glass anyway). */
export const MAX_HOLD_MS = 30_000;

/** foam: the tallest the foam can get while pouring (level units, on top of the liquid). */
export const FOAM_MAX = 0.1;
/** foam: how fast the foam builds up (ms of pouring at flow 1 to reach ~63 % of FOAM_MAX). */
export const FOAM_BUILD_MS = 600;
/** foam: the head left on top once the foam has settled. It counts in the final level. */
export const FOAM_HEAD = 0.03;

/** ice: how much the ice cube pushes the level up. */
export const ICE_RISE = 0.07;
/** ice: the cube falls when the liquid reaches a level between these two (seeded per glass). */
export const ICE_TRIGGER_MIN = 0.25;
export const ICE_TRIGGER_MAX = 0.45;

/** tilt: the glass spills this much below the rim. */
export const TILT_MARGIN = 0.05;

/** leak: the level drops by an amount between these two after release (seeded per glass). */
export const LEAK_MIN = 0.04;
export const LEAK_MAX = 0.08;

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

/** Pure pouring time (ms, no drip) for the liquid alone to reach `level`. */
function pourTimeFor(spec: GlassSpec, level: number): number {
  const { taper, fullMs } = profileFor(spec);
  const h = Math.min(Math.max(level, 0), 2); // 2 = well past the rim, enough for any overflow test
  const fraction = volumeUpTo(taper, h) / volumeUpTo(taper, 1);
  return (fraction * fullMs) / spec.flow;
}

/** Score of one level against one line, given the spill limit. */
function scoreAgainst(level: number, line: number, limit: number): number {
  if (!Number.isFinite(level) || level > limit) return 0; // overflow
  const distance = Math.abs(level - line);
  if (distance < PERFECT_TOLERANCE) return 100;
  const x = (distance - PERFECT_TOLERANCE) / SCORE_SPREAD;
  const score = Math.round(1 + 98 * Math.exp(-x * x));
  return Math.min(99, Math.max(1, score));
}

// ---------------------------------------------------------------------------
// Twist parameters (deterministic, from the spec itself)
// ---------------------------------------------------------------------------

/**
 * A number in [0, 1) that depends only on the glass spec (FNV-1a hash).
 * Same spec → same number, on every phone and on the server. `salt` gives
 * independent numbers for different uses.
 */
export function twistSeed(spec: GlassSpec, salt = ''): number {
  const text = `${spec.model}|${spec.line}|${spec.flow}|${spec.twist}|${spec.customer}|${salt}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 4294967296;
}

export function isLayered(spec: GlassSpec): boolean {
  return spec.twist === 'layers2' || spec.twist === 'layers3';
}

/** The lines to hit, bottom to top. One line, except for layers2 (2) and layers3 (3), evenly spaced up to spec.line. */
export function layerLines(spec: GlassSpec): number[] {
  const count = spec.twist === 'layers2' ? 2 : spec.twist === 'layers3' ? 3 : 1;
  return Array.from({ length: count }, (_, k) => quantize((spec.line * (k + 1)) / count));
}

/** Level above which the glass spills: 1, or 1 - TILT_MARGIN when the boat tilts. */
export function overflowLimit(spec: GlassSpec): number {
  return spec.twist === 'tilt' ? 1 - TILT_MARGIN : 1;
}

/** foam: foam thickness after pouring for pourMs (0 for other twists). */
export function foamAt(spec: GlassSpec, pourMs: number): number {
  if (spec.twist !== 'foam') return 0;
  const t = sanitizeHold(pourMs);
  return quantize(FOAM_MAX * (1 - Math.exp(-(spec.flow * t) / FOAM_BUILD_MS)));
}

/** ice: the liquid level at which the cube falls in (Infinity for other twists). */
export function iceTrigger(spec: GlassSpec): number {
  if (spec.twist !== 'ice') return Number.POSITIVE_INFINITY;
  return quantize(ICE_TRIGGER_MIN + (ICE_TRIGGER_MAX - ICE_TRIGGER_MIN) * twistSeed(spec, 'ice'));
}

/** leak: how much the level drops after release (0 for other twists). */
export function leakAmount(spec: GlassSpec): number {
  if (spec.twist !== 'leak') return 0;
  return quantize(LEAK_MIN + (LEAK_MAX - LEAK_MIN) * twistSeed(spec, 'leak'));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Liquid level after pouring for `pourMs` milliseconds, WITHOUT drops or twist effects.
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

/** Detailed result of one glass, for any number of presses. */
export interface PourDetail {
  /** Final level (0..1+, not capped). */
  level: number;
  score: number;
  overflow: boolean;
  /** layers: final level after each press (one entry for other twists). */
  layerLevels: number[];
  /** The highest the glass got (liquid + ice + foam), used for the overflow check. */
  peak: number;
}

/**
 * The full formula, for one or several presses (`holds`, in ms).
 * - layers2 / layers3: one press per line, in order; extra presses are ignored,
 *   missing presses leave their layer at the previous level.
 * - every other twist: only holds[0] counts.
 */
export function pourSequence(spec: GlassSpec, holds: readonly number[]): PourDetail {
  profileFor(spec); // validates the spec
  const limit = overflowLimit(spec);

  if (isLayered(spec)) {
    const lines = layerLines(spec);
    let pouredMs = 0;
    const layerLevels = lines.map((_, k) => {
      const h = sanitizeHold(holds[k] ?? 0);
      if (h > 0) pouredMs += h + DRIP_MS; // each press has its own trailing drops
      return pouredMs > 0 ? levelAfter(spec, pouredMs) : 0;
    });
    const level = layerLevels[layerLevels.length - 1] ?? 0;
    const overflow = level > limit;
    const total = layerLevels.reduce((sum, l, k) => sum + scoreAgainst(l, lines[k]!, limit), 0);
    const score = overflow ? 0 : Math.round(total / lines.length);
    return { level, score, overflow, layerLevels, peak: level };
  }

  const h = sanitizeHold(holds[0] ?? 0);
  // A tap of 0 ms pours nothing: no drops, no foam, no ice, nothing to leak.
  const liquid = h > 0 ? levelAfter(spec, h + DRIP_MS) : 0;
  const ice = spec.twist === 'ice' && liquid > 0 ? ICE_RISE : 0;
  const peak = quantize(liquid + ice + foamAt(spec, h));
  const head = spec.twist === 'foam' && liquid > 0 ? FOAM_HEAD : 0;
  const level = quantize(Math.max(0, liquid + ice + head - leakAmount(spec)));
  const overflow = peak > limit;
  const score = overflow ? 0 : scoreAgainst(level, spec.line, limit);
  return { level, score, overflow, layerLevels: [level], peak };
}

/** Final level (0..1+) after a hold of holdMs, trailing drops and twist included. Deterministic. (00 §7) */
export function finalLevel(spec: GlassSpec, holdMs: number): number {
  return pourSequence(spec, [holdMs]).level;
}

/** Score 0..100 from the final level and the line. (00 §7) */
export function scoreFor(spec: GlassSpec, level: number): number {
  profileFor(spec); // validates the spec
  return scoreAgainst(level, spec.line, overflowLimit(spec));
}

/** Shortcut for the server. `level` is capped at 1 (the glass cannot hold more); `overflow` says it spilled. (00 §7) */
export function pour(
  spec: GlassSpec,
  holdMs: number,
): { level: number; score: number; overflow: boolean } {
  const { level, score, overflow } = pourSequence(spec, [holdMs]);
  return { level: Math.min(level, 1), score, overflow };
}

/**
 * Inverse of finalLevel for ONE press: how long to hold so that the final level is `target`.
 * Takes the twist into account (ice, foam head, leak). Returns 0 if the drops alone reach it.
 * Used by tests, the tutorial and level tuning.
 */
export function holdMsForLevel(spec: GlassSpec, target: number): number {
  const ice = spec.twist === 'ice' ? ICE_RISE : 0;
  const head = spec.twist === 'foam' ? FOAM_HEAD : 0;
  const liquidTarget = target - ice - head + leakAmount(spec);
  return Math.max(0, pourTimeFor(spec, liquidTarget) - DRIP_MS);
}

/** The perfect presses for a glass: one per line (layers) or a single one. Each lands exactly on its line. */
export function idealHolds(spec: GlassSpec): number[] {
  if (!isLayered(spec)) return [holdMsForLevel(spec, spec.line)];
  let pouredMs = 0;
  return layerLines(spec).map((line) => {
    const hold = Math.max(0, pourTimeFor(spec, line) - pouredMs - DRIP_MS);
    pouredMs += hold + DRIP_MS;
    return hold;
  });
}

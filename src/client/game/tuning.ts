// src/client/game/tuning.ts — P1
// Difficulty tuning (01 Task 6.2): "a good player should average about 85".
//
// We can't playtest 5 nights by hand for every change, so this file MODELS a player:
// they release a bit early or late, with a timing error that follows a normal (bell)
// curve of width `sigmaMs`. For a glass, we average the real score (shared/pour.ts) over
// every possible error, weighted by how likely it is. No randomness: the same glass
// always gives the same expected score, so the numbers are reproducible.
//
// Assumptions (to check in the real playtest with 20-50 people, Sat 6 Dec):
//   - a good player is ~70 ms off on average (GOOD_PLAYER_SIGMA_MS);
//   - twists that hide information make players less precise (TWIST_DIFFICULTY);
//   - players know the twist rules (they learned that ice adds a bit, leaks drop...).

import type { GlassSpec, Twist } from '../../shared/types';
import { DRIP_MS, holdMsForLevel, isLayered, layerLines, pourSequence } from '../../shared/pour.ts';

export const GOOD_PLAYER_SIGMA_MS = 70;
export const CASUAL_PLAYER_SIGMA_MS = 120;
export const BEGINNER_SIGMA_MS = 180;

/** How much less precise players are with each twist (multiplies the timing error). */
export const TWIST_DIFFICULTY: Readonly<Record<Twist, number>> = {
  none: 1,
  layers2: 1.05, // each press is a normal press, but there are several
  layers3: 1.1,
  foam: 1.15, // the foam hides where the liquid really is
  ice: 1.1, // a sudden jump to anticipate
  spin: 1.2, // the line is sometimes behind the glass
  tilt: 1.1, // the surface moves
  leak: 1.25, // you must overshoot by an amount you can't see
  steam: 1.3, // the top of the glass is hidden
  hidden_line: 1.6, // you pour from memory
};

/** Normal-curve sample points and weights from -3.5σ to +3.5σ (weights sum to 1). */
function normalGrid(points: number): { z: number; w: number }[] {
  const grid: { z: number; w: number }[] = [];
  let total = 0;
  for (let i = 0; i < points; i++) {
    const z = -3.5 + (7 * i) / (points - 1);
    const w = Math.exp((-z * z) / 2);
    grid.push({ z, w });
    total += w;
  }
  return grid.map(({ z, w }) => ({ z, w: w / total }));
}

const SINGLE_GRID = normalGrid(141); // fine: the score curve has a sharp peak
const LAYER_GRID = normalGrid(17); // coarser per press, because presses multiply (17³ ≈ 5000)

/** Pouring time (ms, no drip) for the liquid alone to reach `level`. */
function pourTimeTo(spec: GlassSpec, level: number): number {
  return holdMsForLevel({ ...spec, twist: 'none' }, level) + DRIP_MS;
}

/**
 * Average score of a player whose release is off by a normal error of width `sigmaMs`
 * (multiplied by the twist difficulty). Layers: the player aims each press at its line
 * from wherever the previous press really stopped.
 */
export function expectedScore(spec: GlassSpec, sigmaMs: number = GOOD_PLAYER_SIGMA_MS): number {
  const sigma = sigmaMs * TWIST_DIFFICULTY[spec.twist];

  if (!isLayered(spec)) {
    const ideal = holdMsForLevel(spec, spec.line);
    let sum = 0;
    for (const { z, w } of SINGLE_GRID) sum += w * pourSequence(spec, [Math.max(0, ideal + z * sigma)]).score;
    return sum;
  }

  const lines = layerLines(spec);
  // Walks every combination of errors, press by press (depth-first), weighting each path.
  function walk(press: number, holds: number[], pouredMs: number, weight: number): number {
    if (press === lines.length) return weight * pourSequence(spec, holds).score;
    const ideal = Math.max(0, pourTimeTo(spec, lines[press]!) - pouredMs - DRIP_MS);
    let sum = 0;
    for (const { z, w } of LAYER_GRID) {
      const hold = Math.max(0, ideal + z * sigma);
      sum += walk(press + 1, [...holds, hold], pouredMs + hold + DRIP_MS, weight * w);
    }
    return sum;
  }
  return walk(0, [], 0, 1);
}

/** Expected total of a list of glasses (a level or a night). */
export function expectedTotal(glasses: readonly GlassSpec[], sigmaMs: number = GOOD_PLAYER_SIGMA_MS): number {
  return glasses.reduce((sum, g) => sum + expectedScore(g, sigmaMs), 0);
}

export const FLOW_MIN = 0.5;
export const FLOW_MAX = 1.4;
export const FLOW_STEP = 0.05;

/**
 * The flow (rounded to 0.05, between FLOW_MIN and FLOW_MAX) that brings a good player's
 * expected score closest to `target`. Faster flow = the level rises faster = harder.
 */
export function tuneFlow(spec: GlassSpec, target: number, sigmaMs: number = GOOD_PLAYER_SIGMA_MS): number {
  let best = spec.flow;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let f = FLOW_MIN; f <= FLOW_MAX + 1e-9; f += FLOW_STEP) {
    const flow = Math.round(f * 100) / 100;
    const gap = Math.abs(expectedScore({ ...spec, flow }, sigmaMs) - target);
    if (gap < bestGap - 1e-9) {
      bestGap = gap;
      best = flow;
    }
  }
  return best;
}

/**
 * Star thresholds for a level, from the model:
 *   3★ ≈ what a good player scores on average, 2★ ≈ a casual player, 1★ ≈ a beginner.
 * Rounded down to a multiple of 5, always increasing, 1★ at least 30 per glass.
 */
export function starThresholds(glasses: readonly GlassSpec[]): [number, number, number] {
  const floor5 = (x: number): number => Math.floor(x / 5) * 5;
  const n = glasses.length;
  const three = Math.min(100 * n, floor5(expectedTotal(glasses, GOOD_PLAYER_SIGMA_MS)));
  const two = Math.min(three - 5 * n, floor5(expectedTotal(glasses, CASUAL_PLAYER_SIGMA_MS)));
  const one = Math.max(30 * n, Math.min(two - 5 * n, floor5(expectedTotal(glasses, BEGINNER_SIGMA_MS))));
  return [one, Math.max(two, one + 5), Math.max(three, Math.max(two, one + 5) + 5)];
}

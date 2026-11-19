// src/client/game/levelPlayer.ts — P1
// Levels mode (01 Task 3.2 and 3.3): plays a levels/<id>.json file with the same loop as
// the night (playRound), then POST /api/level/complete and shows 1, 2 or 3 stars.
//
// Scores are computed locally with pour.ts (same function as the server), so the stars
// show instantly; the server's answer (authoritative stars + updated player) follows.

import type { GlassSpec, Level, LocationId, PlayerState, Twist } from '../../shared/types';
import { GLASS_PROFILES } from '../../shared/pour.ts';
import { playRound, withRetry, type PlayGlass, type RoundEvents } from './round.ts';
import type { PourOutcome } from './pourSession';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const LOCATIONS: readonly LocationId[] = ['cafe', 'beach', 'chalet', 'fair', 'pirate', 'castle'];
const TWISTS: readonly Twist[] = [
  'none', 'layers2', 'layers3', 'foam', 'ice', 'spin', 'tilt', 'leak', 'steam', 'hidden_line',
];
export const MIN_GLASSES = 3;
export const MAX_GLASSES = 5;

/**
 * Checks that untyped JSON is a valid Level (01 Task 3, contract §6.1) and returns it typed.
 * Throws an Error that says exactly what is wrong, so a broken level file is caught by
 * `npm run test` instead of on a player's phone.
 */
export function parseLevel(json: unknown, expectedId?: string): Level {
  const fail = (why: string): never => {
    throw new Error(`level ${expectedId ?? '?'}: ${why}`);
  };
  if (typeof json !== 'object' || json === null) return fail('not an object');
  const data = json as Record<string, unknown>;

  const { id, location, glasses, stars } = data;
  if (typeof id !== 'string' || id === '') return fail('"id" must be a non-empty string');
  if (expectedId !== undefined && id !== expectedId) return fail(`"id" is "${id}", file name says "${expectedId}"`);
  if (!LOCATIONS.includes(location as LocationId)) return fail(`unknown "location" ${String(location)}`);
  if (!Array.isArray(glasses) || glasses.length < MIN_GLASSES || glasses.length > MAX_GLASSES) {
    return fail(`"glasses" must have ${MIN_GLASSES} to ${MAX_GLASSES} entries`);
  }
  const parsedGlasses = glasses.map((g, i) => parseGlass(g, (why) => fail(`glass ${i}: ${why}`)));

  if (!Array.isArray(stars) || stars.length !== 3 || !stars.every((s) => Number.isInteger(s))) {
    return fail('"stars" must be 3 whole numbers');
  }
  const [one, two, three] = stars as [number, number, number];
  const max = 100 * parsedGlasses.length;
  if (!(one > 0 && one < two && two < three && three <= max)) {
    return fail(`"stars" must go up (1★ < 2★ < 3★) and stay ≤ ${max}`);
  }

  return { id, location: location as LocationId, glasses: parsedGlasses, stars: [one, two, three] };
}

function parseGlass(json: unknown, fail: (why: string) => never): GlassSpec {
  if (typeof json !== 'object' || json === null) return fail('not an object');
  const g = json as Record<string, unknown>;
  if (typeof g.model !== 'string' || !(g.model in GLASS_PROFILES)) return fail(`unknown model ${String(g.model)}`);
  if (typeof g.line !== 'number' || !(g.line > 0 && g.line < 1)) return fail('"line" must be between 0 and 1');
  if (typeof g.flow !== 'number' || !(g.flow > 0 && g.flow <= 3)) return fail('"flow" must be between 0 and 3');
  if (!TWISTS.includes(g.twist as Twist)) return fail(`unknown twist ${String(g.twist)}`);
  if (typeof g.customer !== 'string' || g.customer === '') return fail('"customer" is missing');
  return {
    model: g.model as GlassSpec['model'],
    line: g.line,
    flow: g.flow,
    twist: g.twist as Twist,
    customer: g.customer,
  };
}

// ---------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------

/** 0..3 stars: the number of thresholds in `level.stars` that `total` reaches. */
export function starsFor(level: Pick<Level, 'stars'>, total: number): 0 | 1 | 2 | 3 {
  return level.stars.filter((threshold) => total >= threshold).length as 0 | 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// Playing a level
// ---------------------------------------------------------------------------

/** POST /api/level/complete. P3's `api` (src/client/api.ts) fits this shape as-is. */
export interface LevelApi {
  completeLevel(levelId: string, scores: number[]): Promise<{ stars: number; player: PlayerState }>;
}

export interface LevelEvents extends RoundEvents {
  /** Right after the last glass, computed locally: show the stars immediately. */
  onLevelEnd?(result: LevelResult): void;
  /** The server confirmed (stars may differ only if the server is newer than the client). */
  onServerConfirmed?(stars: number, player: PlayerState): void;
  onError?(error: unknown): void;
}

export interface LevelResult {
  levelId: string;
  scores: number[];
  total: number;
  stars: 0 | 1 | 2 | 3;
}

export interface LevelOptions {
  level: Level;
  playGlass: PlayGlass;
  /** Optional: without it (offline / dev), the level is only scored locally. */
  api?: LevelApi;
  events?: LevelEvents;
  pauseMs?: number;
  wait?: (ms: number) => Promise<void>;
}

export async function playLevel(options: LevelOptions): Promise<LevelResult> {
  const { level, api, events = {} } = options;

  const outcomes = (await playRound({
    glasses: level.glasses,
    playGlass: options.playGlass,
    events,
    ...(options.pauseMs !== undefined ? { pauseMs: options.pauseMs } : {}),
    ...(options.wait !== undefined ? { wait: options.wait } : {}),
  })) as PourOutcome[]; // nothing is skipped in Levels mode

  const scores = outcomes.map((o) => o.score);
  const total = scores.reduce((sum, s) => sum + s, 0);
  const result: LevelResult = { levelId: level.id, scores, total, stars: starsFor(level, total) };
  events.onLevelEnd?.(result);

  if (api) {
    try {
      const confirmed = await withRetry(() => api.completeLevel(level.id, scores), options.wait);
      events.onServerConfirmed?.(confirmed.stars, confirmed.player);
    } catch (error) {
      events.onError?.(error);
    }
  }
  return result;
}

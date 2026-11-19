// src/server/score.ts — P3 (Task 2)
// POST /api/pour logic: re-read the day's GlassSpec, score with the pour
// function (P1's src/shared/pour.ts when it lands; ./pourFallback until
// then), and record the result — exactly once per glass per day.
//
// One-try rule: the result is written with hSetNX, so the first writer
// wins atomically (brief piège: no double score on double tap). A replay
// returns the STORED result without recomputing.
import type { DailyService, GlassSpec, PourResult } from '../shared/types';
import { fallbackPour } from './pourFallback';
import { glassCrowdKey, glassScoresKey, poursKey, type Store } from './redis';

/** §7 pour signature (P1's pour() and the fallback both match it). */
export type PourFn = (spec: GlassSpec, holdMs: number) => {
  level: number;
  score: number;
  overflow: boolean;
};

/** Holds longer than this are rejected (broken client or abuse). */
export const MAX_HOLD_MS = 60_000;

/** Below this many other pours, crowdLine/beatPercent are seeded (T4 rule). */
export const CROWD_MIN_PLAYERS = 5;

/** beatPercent seed while the crowd is too small to measure. */
export const SEEDED_BEAT_PERCENT = 50;

export type PourInput = {
  username: string;
  dayId: string;
  glassIndex: number;
  holdMs: number;
};

export type PourOutcome =
  | { ok: true; result: PourResult; replayed: boolean }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validateStoredPour(value: unknown): PourResult | undefined {
  if (!isRecord(value)) return undefined;
  const { score, level, overflow, crowdLine, beatPercent } = value;
  if (
    typeof score !== 'number' ||
    typeof level !== 'number' ||
    typeof overflow !== 'boolean' ||
    typeof crowdLine !== 'number' ||
    typeof beatPercent !== 'number'
  ) {
    return undefined;
  }
  return { score, level, overflow, crowdLine, beatPercent };
}

function parseStoredPour(raw: string | undefined): PourResult | undefined {
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return validateStoredPour(parsed);
  } catch {
    return undefined;
  }
}

function readCount(stats: Record<string, string>): { sumMilli: number; count: number } {
  const sumMilli = Number(stats['sum'] ?? '0') || 0;
  const count = Number(stats['count'] ?? '0') || 0;
  return { sumMilli, count };
}

export async function pourGlass(
  store: Store,
  day: DailyService,
  input: PourInput,
  pourFn: PourFn = fallbackPour
): Promise<PourOutcome> {
  const { username, dayId, glassIndex, holdMs } = input;
  if (dayId !== day.dayId) {
    return { ok: false, error: `Stale day: post plays ${day.dayId}, request says ${dayId}` };
  }
  if (!Number.isInteger(glassIndex) || glassIndex < 0 || glassIndex >= day.glasses.length) {
    return { ok: false, error: `glassIndex ${glassIndex} out of range for ${day.glasses.length} glasses` };
  }
  if (!Number.isFinite(holdMs) || holdMs < 0 || holdMs > MAX_HOLD_MS) {
    return { ok: false, error: `holdMs must be within 0..${MAX_HOLD_MS}` };
  }
  const spec = day.glasses[glassIndex];
  if (spec === undefined) return { ok: false, error: 'Glass not found' };

  // Fast path: already played → return the stored result WITHOUT
  // recomputing. Two genuinely concurrent first pours both miss this
  // path and fall through to the atomic hSetNX below.
  const field = String(glassIndex);
  const existing = parseStoredPour(await store.hGet(poursKey(dayId, username), field));
  if (existing !== undefined) return { ok: true, result: existing, replayed: true };

  const computed = pourFn(spec, holdMs);
  const level = Number.isFinite(computed.level) && computed.level > 0 ? computed.level : 0;
  const overflow = computed.overflow || level > 1;
  const score =
    overflow || !Number.isFinite(computed.score)
      ? 0
      : Math.min(100, Math.max(0, Math.round(computed.score)));

  // Crowd snapshot BEFORE recording self: the line shows where OTHERS
  // stopped, and beatPercent counts players who did worse (T4 rule).
  const stats = readCount(await store.hGetAll(glassCrowdKey(dayId, glassIndex)));
  const others = await store.zRange(glassScoresKey(dayId, glassIndex), 0, -1);
  const crowdLine =
    stats.count >= CROWD_MIN_PLAYERS ? stats.sumMilli / stats.count / 1000 : spec.line;
  let beatPercent = SEEDED_BEAT_PERCENT;
  if (others.length >= CROWD_MIN_PLAYERS) {
    const worse = others.filter((entry) => entry.score < score).length;
    beatPercent = Math.round((100 * worse) / others.length);
  }
  const result: PourResult = { score, level: overflow ? 1 : level, overflow, crowdLine, beatPercent };

  const first = await store.hSetNX(poursKey(dayId, username), field, JSON.stringify(result));
  if (first === 1) {
    await store.zAdd(glassScoresKey(dayId, glassIndex), { member: username, score });
    await store.hIncrBy(glassCrowdKey(dayId, glassIndex), 'sum', Math.round(Math.min(level, 1) * 1000));
    await store.hIncrBy(glassCrowdKey(dayId, glassIndex), 'count', 1);
    return { ok: true, result, replayed: false };
  }

  // Replay: return what is stored, never recompute.
  const stored = parseStoredPour(await store.hGet(poursKey(dayId, username), field));
  if (stored !== undefined) return { ok: true, result: stored, replayed: true };
  // Corrupt record (should not happen): answer the correct fresh score
  // without writing anything, so a bad row can never poison the crowd.
  return { ok: true, result, replayed: true };
}

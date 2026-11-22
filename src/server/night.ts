// src/server/night.ts — P3 (Task 3)
// POST /api/night/finish: totals, tips, streak, rank and shareText.
// Idempotent: finishing twice returns the stored NightSummary.
//
// P3-defined rules (absent from the contract, flagged to the team):
//   - base tips = 30% of the total (ratio of the §10/§6.1 mock: 135/451),
//     then the streak multiplier (+1%/night, +30% max). Scores untouched.
//   - serverLevel = 1 + floor(tips / 100): ~1 level per 3 good nights.
//   - shareText guests = the client's seeded pick (shared/guests.ts), NOT
//     GlassSpec.customer: the client shows pickGuestIds(day.location, dayId).
//   - customer→emoji = shared emojiForCustomer (§6.1 glyphs for the
//     classic five, stable palette pick for the other 175).
import type { DailyService, NightSummary, PlayerState, PourResult } from '../shared/types';
import { CUSTOMER_ROSTER } from '../shared/customerRoster';
import { emojiForCustomer, pickGuestIds } from '../shared/guests';
import { applyStreak } from './streak';
import {
  allBoardKey,
  dayBoardKey,
  nightKey,
  playerKey,
  poursKey,
  streakBoardKey,
  type Store,
} from './redis';

export const TIPS_RATE = 0.3;
export const TIPS_PER_LEVEL = 100;

/** `☕ Nuit #24 🍺98 🧚100 👻71 ⛵88 🧙94 = 451 · 🔥12` (§6.1 shape). */
export function buildShareText(
  night: number,
  customers: string[],
  scores: number[],
  total: number,
  streak: number
): string {
  const parts = scores.map((score, i) => {
    const emoji = emojiForCustomer(customers[i] ?? '');
    return `${emoji}${score}`;
  });
  return `☕ Nuit #${night} ${parts.join(' ')} = ${total} · 🔥${streak}`;
}

export type FinishOutcome = { ok: true; summary: NightSummary } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStreakMilestone(value: unknown): value is 3 | 7 | 14 | 30 {
  return value === 3 || value === 7 || value === 14 || value === 30;
}

function validateNightSummary(value: unknown): NightSummary | undefined {
  if (!isRecord(value)) return undefined;
  const { dayId, scores, total, tips, streak, streakMilestone, freezeUsed, rank, shareText } = value;
  if (
    typeof dayId !== 'string' ||
    !Array.isArray(scores) ||
    !scores.every((s): s is number => typeof s === 'number') ||
    typeof total !== 'number' ||
    typeof tips !== 'number' ||
    typeof streak !== 'number' ||
    !(streakMilestone === undefined || isStreakMilestone(streakMilestone)) ||
    typeof freezeUsed !== 'boolean' ||
    typeof rank !== 'number' ||
    typeof shareText !== 'string'
  ) {
    return undefined;
  }
  return {
    dayId,
    scores,
    total,
    tips,
    streak,
    ...(streakMilestone === undefined ? {} : { streakMilestone }),
    freezeUsed,
    rank,
    shareText,
  };
}

function validatePourResult(value: unknown): PourResult | undefined {
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

function parseStored(raw: string | undefined): NightSummary | undefined {
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return validateNightSummary(parsed);
  } catch {
    return undefined;
  }
}

async function recordBest(
  store: Store,
  key: string,
  username: string,
  value: number
): Promise<void> {
  const current = await store.zScore(key, username);
  if (current === undefined || value > current) {
    await store.zAdd(key, { member: username, score: value });
  }
}

export async function finishNight(
  store: Store,
  day: DailyService,
  username: string,
  player: PlayerState
): Promise<FinishOutcome> {
  const stored = parseStored(await store.get(nightKey(day.dayId, username)));
  if (stored !== undefined) return { ok: true, summary: stored };

  // Strict: every glass must be poured before the night can finish, so a
  // finish can never be followed by new pours for the same night.
  const pours = await store.hGetAll(poursKey(day.dayId, username));
  const scores: number[] = [];
  for (let i = 0; i < day.glasses.length; i += 1) {
    const raw = pours[String(i)];
    if (raw === undefined) {
      return { ok: false, error: `Glass ${i} has not been poured yet` };
    }
    let result: PourResult | undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      result = validatePourResult(parsed);
    } catch {
      result = undefined;
    }
    if (result === undefined) return { ok: false, error: `Glass ${i} has a corrupt record` };
    scores.push(result.score);
  }

  const total = scores.reduce((sum, s) => sum + s, 0);
  await store.zAdd(dayBoardKey(day.dayId), { member: username, score: total });
  const board = await store.zRange(dayBoardKey(day.dayId), 0, -1);
  const rank = 1 + board.filter((entry) => entry.score > total).length;

  const streak = applyStreak(player, day.dayId);
  const tips = Math.round(total * TIPS_RATE * streak.tipsMultiplier);
  const newTips = player.tips + tips;
  const updated: PlayerState = {
    ...streak.player,
    tips: newTips,
    serverLevel: 1 + Math.floor(newTips / TIPS_PER_LEVEL),
  };
  await store.set(playerKey(username), JSON.stringify(updated));
  await recordBest(store, allBoardKey(), username, total);
  await recordBest(store, streakBoardKey(), username, updated.bestStreak);

  // The guests the client actually showed: same seeded pick, same dayId.
  const guests = pickGuestIds(CUSTOMER_ROSTER, day.location, day.glasses.length, day.dayId);
  const summary: NightSummary = {
    dayId: day.dayId,
    scores,
    total,
    tips,
    streak: updated.streak,
    ...(streak.streakMilestone === undefined ? {} : { streakMilestone: streak.streakMilestone }),
    freezeUsed: streak.freezeUsed,
    rank,
    shareText: buildShareText(day.night, guests, scores, total, updated.streak),
  };
  await store.set(nightKey(day.dayId, username), JSON.stringify(summary));
  return { ok: true, summary };
}

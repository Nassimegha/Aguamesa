// src/server/streak.ts — P3 (Task 3)
// The 🔥 streak (brief T3.2, rules in 00 §1):
//   - yesterday played → +1
//   - exactly one night missed and a freeze 🧊 in stock → consume one,
//     +1, freezeUsed
//   - otherwise → back to 1 (bestStreak keeps the record)
//   - +1 freeze every 7th night, 2 max
//   - milestones at 3/7/14/30: the reward is appended to player.decor so
//     the client, flair (T4) and share text can all see it
//   - tips bonus +1%/night capped at +30%; the SCORE never changes
import type { PlayerState } from '../shared/types';
import { diffDays } from './dates';

export const STREAK_MILESTONES = [3, 7, 14, 30] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

export const FREEZE_EVERY_NIGHTS = 7;
export const MAX_FREEZES = 2;
export const MAX_TIPS_BONUS_NIGHTS = 30;

/** Reward ids by milestone (§1: deco, golden glass, flair badge, neon sign). */
export const REWARD_BY_MILESTONE: Record<StreakMilestone, string> = {
  3: 'reward_cafe_deco_3',
  7: 'reward_golden_glass_7',
  14: 'reward_flair_badge_14',
  30: 'reward_neon_sign_30',
};

export type StreakOutcome = {
  player: PlayerState;
  freezeUsed: boolean;
  streakMilestone: StreakMilestone | undefined;
  tipsMultiplier: number;
};

function isMilestone(streak: number): streak is StreakMilestone {
  return STREAK_MILESTONES.some((m) => m === streak);
}

export function applyStreak(player: PlayerState, todayDayId: string): StreakOutcome {
  const last = player.lastPlayedDayId;
  if (last === todayDayId) {
    // Same-day replay guard (finishNight is idempotent, so this is only a
    // safety net): nothing changes, no milestone twice.
    return {
      player,
      freezeUsed: false,
      streakMilestone: undefined,
      tipsMultiplier: 1 + Math.min(player.streak, MAX_TIPS_BONUS_NIGHTS) / 100,
    };
  }

  let streak: number;
  let freezes = player.streakFreezes;
  let freezeUsed = false;
  if (last === null) {
    streak = 1;
  } else {
    const gap = diffDays(last, todayDayId);
    if (gap === 1) {
      streak = player.streak + 1;
    } else if (gap === 2 && freezes > 0) {
      freezes -= 1;
      freezeUsed = true;
      streak = player.streak + 1;
    } else if (gap !== undefined && gap < 0) {
      // lastPlayed is in the future (clock skew): keep, never nuke.
      streak = player.streak;
    } else {
      streak = 1;
    }
  }

  if (streak > 0 && streak % FREEZE_EVERY_NIGHTS === 0) {
    freezes = Math.min(MAX_FREEZES, freezes + 1);
  }

  const streakMilestone = isMilestone(streak) ? streak : undefined;
  let decor = player.decor;
  if (streakMilestone !== undefined) {
    const reward = REWARD_BY_MILESTONE[streakMilestone];
    if (!decor.includes(reward)) decor = [...decor, reward];
  }

  return {
    player: {
      ...player,
      streak,
      bestStreak: Math.max(player.bestStreak, streak),
      streakFreezes: freezes,
      lastPlayedDayId: todayDayId,
      decor,
    },
    freezeUsed,
    streakMilestone,
    tipsMultiplier: 1 + Math.min(streak, MAX_TIPS_BONUS_NIGHTS) / 100,
  };
}

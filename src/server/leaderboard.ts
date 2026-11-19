// src/server/leaderboard.ts — P3 (Task 4)
// Day, all-time and streak leaderboards: top 50 plus the caller's own
// row with its real rank. Streaks come from the player profiles (one
// mGet for the returned rows only).
//
// Scaling note: ranks are computed from a full ascending zRange reversed
// in code. That is one Redis read and correct at any size, but O(board).
// With thousands of players, switch to paginated ranges.
import type { LeaderboardRow } from '../shared/types';
import { readStreak } from './player';
import { allBoardKey, dayBoardKey, playerKey, streakBoardKey, type Store } from './redis';

export const LEADERBOARD_TOP = 50;

export type BoardScope = 'day' | 'all' | 'streak';

export function boardKeyFor(scope: BoardScope, dayId: string): string {
  if (scope === 'day') return dayBoardKey(dayId);
  if (scope === 'streak') return streakBoardKey();
  return allBoardKey();
}

export async function getLeaderboard(
  store: Store,
  scope: BoardScope,
  dayId: string,
  username: string
): Promise<LeaderboardRow[]> {
  const entries = [...(await store.zRange(boardKeyFor(scope, dayId), 0, -1))].reverse();
  if (entries.length === 0) return [];
  const selfIndex = entries.findIndex((entry) => entry.member === username);
  const top = entries.slice(0, LEADERBOARD_TOP);
  const selfEntry = selfIndex === -1 ? undefined : entries[selfIndex];
  const selfAppended = selfEntry !== undefined && selfIndex >= LEADERBOARD_TOP;
  const shown = selfAppended && selfEntry !== undefined ? [...top, selfEntry] : top;
  const raws = await store.mGet(shown.map((entry) => playerKey(entry.member)));
  return shown.map((entry, i) => {
    const rank = selfAppended && i === shown.length - 1 ? selfIndex + 1 : i + 1;
    return {
      rank,
      username: entry.member,
      total: entry.score,
      streak: readStreak(raws[i] ?? null, entry.member),
    };
  });
}

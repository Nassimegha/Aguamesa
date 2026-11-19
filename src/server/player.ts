// src/server/player.ts — P3 (Task 2)
// Player profiles in Redis (player:{user} as JSON) and the playedToday
// flags derived from the recorded pours.
import type { PlayerState } from '../shared/types';
import { playerKey, poursKey, type Store } from './redis';

export function defaultPlayer(username: string): PlayerState {
  return {
    username,
    serverLevel: 1,
    streak: 0,
    bestStreak: 0,
    streakFreezes: 0,
    lastPlayedDayId: null,
    tips: 0,
    stars: {},
    collection: [],
    decor: [],
    playedToday: [false, false, false, false, false],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPlayerState(value: unknown): value is PlayerState {
  if (!isRecord(value)) return false;
  const lastPlayed = value['lastPlayedDayId'];
  return (
    typeof value['username'] === 'string' &&
    typeof value['serverLevel'] === 'number' &&
    typeof value['streak'] === 'number' &&
    typeof value['bestStreak'] === 'number' &&
    typeof value['streakFreezes'] === 'number' &&
    (typeof lastPlayed === 'string' || lastPlayed === null) &&
    typeof value['tips'] === 'number' &&
    isRecord(value['stars']) &&
    Array.isArray(value['collection']) &&
    Array.isArray(value['decor']) &&
    Array.isArray(value['playedToday'])
  );
}

function parsePlayer(raw: string | undefined, username: string): PlayerState | undefined {
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (isPlayerState(parsed) && parsed.username === username) return parsed;
  return undefined;
}

/** Current streak from a raw profile, 0 when missing or corrupt. */
export function readStreak(raw: string | null, username: string): number {
  if (raw === null) return 0;
  const player = parsePlayer(raw, username);
  return player === undefined ? 0 : player.streak;
}

/** Load the profile, creating (and storing) a default one on first sight. */
export async function loadOrCreatePlayer(store: Store, username: string): Promise<PlayerState> {
  const found = parsePlayer(await store.get(playerKey(username)), username);
  if (found !== undefined) return found;
  const fresh = defaultPlayer(username);
  await store.set(playerKey(username), JSON.stringify(fresh));
  return fresh;
}

export async function savePlayer(store: Store, player: PlayerState): Promise<void> {
  await store.set(playerKey(player.username), JSON.stringify(player));
}

/**
 * One flag per glass of the day: true when a pour is already recorded.
 * Sized by the day's glass count (5, or 7 on saturday_rush).
 */
export async function getPlayedToday(
  store: Store,
  dayId: string,
  username: string,
  glassCount: number
): Promise<boolean[]> {
  const pours = await store.hGetAll(poursKey(dayId, username));
  return Array.from({ length: glassCount }, (_, i) => pours[String(i)] !== undefined);
}

// src/server/flair.ts — P3 (Task 4)
// The server flair, visible everywhere on the subreddit:
//   `☕ Serveur Nv. 12 · 🔥 12 nuits`
// Once the 14-night milestone is EVER reached (bestStreak), the milestone
// badge is appended (`· 🏅14`, `· 🏅30` above 30) and never removed.
// Refreshed after every finished night; failures are logged but never
// fail the finish request (see routes/api.ts).
import type { PlayerState } from '../shared/types';

export type FlairSetter = {
  setPlayerFlair(input: {
    subredditName: string;
    username: string;
    text: string;
  }): Promise<void>;
};

export function flairText(player: PlayerState): string {
  const base = `☕ Serveur Nv. ${player.serverLevel} · 🔥 ${player.streak} nuits`;
  if (player.bestStreak >= 30) return `${base} · 🏅30`;
  if (player.bestStreak >= 14) return `${base} · 🏅14`;
  return base;
}

export async function refreshFlair(
  setter: FlairSetter,
  subredditName: string,
  player: PlayerState
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await setter.setPlayerFlair({ subredditName, username: player.username, text: flairText(player) });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

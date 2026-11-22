// src/server/daily.ts — P3 (Task 3)
// The Service du Jour publisher. The Devvit scheduler (devvit.json:
// daily-night at 00:00 UTC) and the mod menu item "Publier la nuit
// maintenant" both call publishNight().
//
//   - known dayId → the content/days/<dayId>.json DailyService
//   - unknown dayId → the deterministic seeded fallback in fallback.ts
//     (same dayId always builds the same night; playing uses it too),
//     so the game never has an empty day
//   - publishing is idempotent per day: a second call returns the stored
//     post id without creating another post
import type { DailyService } from '../shared/types';
import { getDay } from './content';
import { addDays } from './dates';
import { fallbackDay } from './fallback';
// Re-exported so existing importers keep working; the implementation lives
// in fallback.ts, shared with content.ts (no circular import).
export { fallbackDay, fallbackNight } from './fallback';
import { dayDrinkKey, pickedDrinkForPost } from './drink';
import type { Store } from './redis';

export function nightPostTitle(night: number): string {
  return `Service de la nuit #${night}`;
}

export function nightPostKey(dayId: string): string {
  return `day:${dayId}:post`;
}

/** Minimal Reddit surface publishNight needs (faked in tests). */
export type NightPoster = {
  submitNightPost(input: {
    subredditName: string;
    title: string;
    dayId: string;
    night: number;
  }): Promise<{ postId: string }>;
};

export type PublishOutcome =
  | {
      ok: true;
      postId: string;
      night: number;
      fromFallback: boolean;
      replayed: boolean;
      drinkOfTheDay: string | undefined;
    }
  | { ok: false; error: string };

export function resolveDayForPost(dayId: string): { day: DailyService; fromFallback: boolean } {
  const known = getDay(dayId);
  if (known !== undefined) return { day: known, fromFallback: false };
  return { day: fallbackDay(dayId), fromFallback: true };
}

// ---------- publisher ----------

export async function publishNight(
  store: Store,
  poster: NightPoster,
  subredditName: string,
  dayId: string
): Promise<PublishOutcome> {
  if (subredditName.length === 0) return { ok: false, error: 'Missing subreddit name' };
  const existing = await store.get(nightPostKey(dayId));
  if (existing !== undefined && existing.length > 0) {
    const { day, fromFallback } = resolveDayForPost(dayId);
    return {
      ok: true,
      postId: existing,
      night: day.night,
      fromFallback,
      replayed: true,
      drinkOfTheDay: undefined,
    };
  }
  const { day, fromFallback } = resolveDayForPost(dayId);
  let postId: string;
  try {
    const posted = await poster.submitNightPost({
      subredditName,
      title: nightPostTitle(day.night),
      dayId: day.dayId,
      night: day.night,
    });
    postId = posted.postId;
  } catch (error) {
    return { ok: false, error: `Post creation failed: ${String(error)}` };
  }
  await store.set(nightPostKey(dayId), postId);
  // Carry yesterday's mod-picked drink into the new day (T5.2). Without
  // a pick, the content default stands.
  let drinkOfTheDay: string | undefined;
  const yesterday = addDays(dayId, -1);
  if (yesterday !== undefined) {
    const yesterdayPost = await store.get(nightPostKey(yesterday));
    if (yesterdayPost !== undefined) {
      drinkOfTheDay = await pickedDrinkForPost(store, yesterdayPost);
    }
  }
  if (drinkOfTheDay !== undefined) {
    await store.set(dayDrinkKey(dayId), drinkOfTheDay);
  }
  return { ok: true, postId, night: day.night, fromFallback, replayed: false, drinkOfTheDay };
}

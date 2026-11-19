// src/server/daily.ts — P3 (Task 3)
// The Service du Jour publisher. The Devvit scheduler (devvit.json:
// daily-night at 00:00 UTC) and the mod menu item "Publier la nuit
// maintenant" both call publishNight().
//
//   - known dayId → the content/days/<dayId>.json DailyService
//   - unknown dayId → a deterministic seeded fallback (same dayId always
//     builds the same night), so the game never has an empty day
//   - publishing is idempotent per day: a second call returns the stored
//     post id without creating another post
import type { DailyService, GlassModel, GlassSpec, LocationId, Twist } from '../shared/types';
import { specialForDayId } from './calendar';
import { getDay } from './content';
import { addDays, diffDays } from './dates';
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

// ---------- seeded fallback ----------

function hashDayId(dayId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < dayId.length; i += 1) {
    hash ^= dayId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic PRNG (mulberry32): same seed, same night, everywhere. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FALLBACK_LOCATION_CYCLE: LocationId[] = ['cafe', 'beach', 'chalet', 'fair', 'pirate', 'castle'];
const FALLBACK_MODELS: GlassModel[] = [
  'pint',
  'mug_giant',
  'thimble',
  'flute',
  'coconut',
  'teacup',
  'goblet',
  'tankard',
];
// Mild twists only: P1's easy/hard twist lists land Nov 30 (Task 5 then
// extends both the content and this pool).
const FALLBACK_TWISTS: Twist[] = ['none', 'none', 'none', 'foam', 'steam', 'ice'];
const FALLBACK_CUSTOMERS = ['giant', 'fairy', 'ghost', 'pirate', 'wizard', 'sailor', 'owl', 'barista'];

/** Night number for fallback days: night 24 was 2026-11-24, ±1 per day. */
export function fallbackNight(dayId: string): number {
  const gap = diffDays('2026-11-24', dayId);
  if (gap === undefined) return 1;
  return Math.max(1, 24 + gap);
}

export function fallbackDay(dayId: string): DailyService {
  const rng = mulberry32(hashDayId(dayId));
  const pick = <T>(pool: readonly T[]): T => {
    const item = pool[Math.floor(rng() * pool.length)];
    if (item === undefined) throw new Error('Empty fallback pool');
    return item;
  };
  // The fallback honors the week calendar like authored content does.
  const special = specialForDayId(dayId);
  const count = special === 'saturday_rush' ? 7 : 5;
  const glasses: GlassSpec[] = Array.from({ length: count }, () => ({
    model: pick(FALLBACK_MODELS),
    line: 0.6 + rng() * 0.25,
    flow: 0.7 + rng() * 0.6,
    twist: special === 'blind_friday' ? 'hidden_line' : pick(FALLBACK_TWISTS),
    customer: pick(FALLBACK_CUSTOMERS),
  }));
  if (special === 'sunday_boss') {
    glasses[4] = {
      model: pick(FALLBACK_MODELS),
      line: 0.7 + rng() * 0.12,
      flow: 0.9 + rng() * 0.3,
      twist: 'layers3',
      customer: pick(FALLBACK_CUSTOMERS),
    };
  }
  return {
    dayId,
    night: fallbackNight(dayId),
    location: pick(FALLBACK_LOCATION_CYCLE),
    glasses,
    ...(special === undefined ? {} : { special }),
  };
}

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

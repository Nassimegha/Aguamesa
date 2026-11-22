// src/server/fallback.ts — P3
// The seeded fallback night: for dayIds with no content/days/<dayId>.json,
// publishing (daily.ts resolveDayForPost) and playing (content.ts
// resolvePostDay) BOTH use fallbackDay() — same dayId, same DailyService,
// for everyone, on every call. An authored day always wins over the fallback.
//
// The night is a pure function of the dayId (no Math.random, no Date.now):
// a mulberry32 stream seeded by the dayId picks the location first, then
// the glasses; the guests come from the SHARED seeded pick (guests.ts), so
// they are identical to the customers the client shows for that night
// (world/roster.ts pickCustomers with the same seed).
//
// This module is shared by daily.ts and content.ts (it must import NEITHER:
// daily.ts already imports content.ts, so that would be a circular import).
// Server-safe: guests.ts + customerRoster.ts are pure arithmetic + strings
// (no three, no JSON import) — the server never imports world/roster.ts.
//
// No drinkOfTheDay is invented here: the live mod-picked drink still
// carries over through the day drink key (drink.ts).
import type { DailyService, GlassModel, GlassSpec, LocationId, Twist } from '../shared/types';
import { CUSTOMER_ROSTER } from '../shared/customerRoster';
import { hashSeed, mulberry32, pickGuestIds } from '../shared/guests';
import { specialForDayId } from './calendar';
import { diffDays } from './dates';

const FALLBACK_LOCATIONS: readonly LocationId[] = ['cafe', 'beach', 'chalet', 'fair', 'pirate', 'castle'];
const FALLBACK_MODELS: readonly GlassModel[] = [
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
const FALLBACK_TWISTS: readonly Twist[] = ['none', 'none', 'none', 'foam', 'steam', 'ice'];

/** Night number for fallback days: night 24 was 2026-11-24, ±1 per day. */
export function fallbackNight(dayId: string): number {
  const gap = diffDays('2026-11-24', dayId);
  if (gap === undefined) return 1;
  return Math.max(1, 24 + gap);
}

/**
 * The seeded night for a dayId with no authored file. Deterministic: same
 * dayId = identical DailyService on every call (publish and play agree);
 * different dayIds deal different nights. Honors the week calendar like
 * authored content does (blind Friday, 7-glass Saturday rush, boss Sunday).
 */
export function fallbackDay(dayId: string): DailyService {
  const rng = mulberry32(hashSeed(dayId));
  const pick = <T>(pool: readonly T[]): T => {
    const item = pool[Math.floor(rng() * pool.length)];
    if (item === undefined) throw new Error('Empty fallback pool');
    return item;
  };
  const special = specialForDayId(dayId);
  const count = special === 'saturday_rush' ? 7 : 5;
  // Location first, then that location's guests (same seeded pick the
  // client shows: no duplicates within a night, 30 guests per location).
  const location = pick(FALLBACK_LOCATIONS);
  const customers = pickGuestIds(CUSTOMER_ROSTER, location, count, dayId);
  const glasses: GlassSpec[] = customers.map((customer) => ({
    model: pick(FALLBACK_MODELS),
    line: 0.6 + rng() * 0.25,
    flow: 0.7 + rng() * 0.6,
    twist: special === 'blind_friday' ? 'hidden_line' : pick(FALLBACK_TWISTS),
    customer,
  }));
  if (special === 'sunday_boss') {
    const boss = glasses[4];
    if (boss !== undefined) boss.twist = 'layers3';
  }
  return {
    dayId,
    night: fallbackNight(dayId),
    location,
    glasses,
    ...(special === undefined ? {} : { special }),
  };
}

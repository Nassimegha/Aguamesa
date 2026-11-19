// src/server/content.ts — P3 (Task 2)
// DailyService registry: the JSON files in content/days/ are statically
// imported so they are bundled into the server (Devvit has no fs at
// runtime). Task 5 adds the 13 other days; each new file needs three
// lines: a `files` entry in tools/tsconfig.server.json (composite builds
// only accept JSON via `files`, not `include` globs), one import below,
// and one DAYS entry.
//
// Shape validation (validateDailyService) is what the Task 5 acceptance
// criterion runs against: every content/days/*.json must pass it.
import type { DailyService, GlassModel, GlassSpec, LocationId, Twist } from '../shared/types';
import day20261124 from '../../content/days/2026-11-24.json' with { type: 'json' };

const GLASS_MODELS: readonly string[] = [
  'pint',
  'mug_giant',
  'thimble',
  'flute',
  'coconut',
  'teacup',
  'goblet',
  'tankard',
];

const TWISTS: readonly string[] = [
  'none',
  'layers2',
  'layers3',
  'foam',
  'ice',
  'spin',
  'tilt',
  'leak',
  'steam',
  'hidden_line',
];

const LOCATIONS: readonly string[] = ['cafe', 'beach', 'chalet', 'fair', 'pirate', 'castle'];

const DAY_ID_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGlassModel(value: unknown): value is GlassModel {
  return typeof value === 'string' && GLASS_MODELS.includes(value);
}

function isTwist(value: unknown): value is Twist {
  return typeof value === 'string' && TWISTS.includes(value);
}

function isLocationId(value: unknown): value is LocationId {
  return typeof value === 'string' && LOCATIONS.includes(value);
}

function isGlassSpec(value: unknown): value is GlassSpec {
  if (!isRecord(value)) return false;
  return (
    isGlassModel(value['model']) &&
    typeof value['line'] === 'number' &&
    value['line'] >= 0 &&
    value['line'] <= 1 &&
    typeof value['flow'] === 'number' &&
    value['flow'] > 0 &&
    isTwist(value['twist']) &&
    typeof value['customer'] === 'string' &&
    value['customer'].length > 0
  );
}

function isGlassSpecArray(value: unknown): value is GlassSpec[] {
  return Array.isArray(value) && value.every(isGlassSpec);
}

/**
 * Full DailyService validation for content files. A normal night has
 * exactly 5 glasses; saturday_rush has 7 (brief T5). Returns the day
 * when valid, undefined otherwise.
 */
export function validateDailyService(value: unknown): DailyService | undefined {
  if (!isRecord(value)) return undefined;
  const special = value['special'];
  if (
    !(
      special === undefined ||
      special === 'blind_friday' ||
      special === 'saturday_rush' ||
      special === 'sunday_boss'
    )
  ) {
    return undefined;
  }
  const drink = value['drinkOfTheDay'];
  if (!(drink === undefined || typeof drink === 'string')) return undefined;
  const glasses = value['glasses'];
  const expected = special === 'saturday_rush' ? 7 : 5;
  if (!isGlassSpecArray(glasses) || glasses.length !== expected) return undefined;
  const dayId = value['dayId'];
  if (typeof dayId !== 'string' || !DAY_ID_PATTERN.test(dayId)) return undefined;
  const night = value['night'];
  if (typeof night !== 'number' || !Number.isInteger(night)) return undefined;
  const location = value['location'];
  if (!isLocationId(location)) return undefined;
  return {
    dayId,
    night,
    location,
    glasses,
    ...(special === undefined ? {} : { special }),
    ...(drink === undefined ? {} : { drinkOfTheDay: drink }),
  };
}

function mustValidate(value: unknown, name: string): DailyService {
  const day = validateDailyService(value);
  if (day === undefined) {
    throw new Error(`Content file ${name} failed DailyService validation`);
  }
  return day;
}

/** Every known DailyService, keyed by dayId. Task 5 extends this to 14 days. */
const DAYS: Record<string, DailyService> = {
  '2026-11-24': mustValidate(day20261124, 'content/days/2026-11-24.json'),
};

export function getDay(dayId: string): DailyService | undefined {
  return DAYS[dayId];
}

/** Latest known day — the fallback when a post carries no dayId (Task 2). */
export function latestDay(): DailyService {
  let best: DailyService | undefined;
  for (const day of Object.values(DAYS)) {
    if (best === undefined || day.dayId > best.dayId) best = day;
  }
  if (best === undefined) throw new Error('No DailyService days registered');
  return best;
}

/**
 * Which day a request plays. Scheduler posts (Task 3) pin their dayId in
 * postData; anything else (old posts, local dev) gets the latest day.
 */
export function resolvePostDay(postData: unknown): DailyService {
  if (isRecord(postData)) {
    const dayId = postData['dayId'];
    if (typeof dayId === 'string') {
      const day = getDay(dayId);
      if (day !== undefined) return day;
    }
  }
  return latestDay();
}

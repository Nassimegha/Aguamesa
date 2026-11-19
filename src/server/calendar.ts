// src/server/calendar.ts — P3 (Task 5)
// The week calendar (brief T5.1):
//   - Friday (blind): every glass hides its line once you start pouring
//   - Saturday (rush): 7 glasses instead of 5
//   - Sunday (boss): the 5th glass is a 3-layer cocktail (layers3)
// Monday–Thursday are normal nights.
//
// The special for a dayId is derived from the weekday, so content files
// and the seeded fallback (daily.ts) always agree. checkSpecialCompliance
// enforces that every content/days/*.json matches its weekday.
import type { DailyService } from '../shared/types';

export type WeekSpecial = 'blind_friday' | 'saturday_rush' | 'sunday_boss';

/** Friday → blind, Saturday → rush, Sunday → boss, else undefined. */
export function specialForDayId(dayId: string): WeekSpecial | undefined {
  const date = new Date(`${dayId}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  const weekday = date.getUTCDay();
  if (weekday === 5) return 'blind_friday';
  if (weekday === 6) return 'saturday_rush';
  if (weekday === 0) return 'sunday_boss';
  return undefined;
}

/**
 * Compliance errors for a content day ([] = compliant):
 * blind nights hide every line, rush nights bring 7 glasses, boss nights
 * end on a 3-layer cocktail, and the special always matches the weekday.
 */
export function checkSpecialCompliance(day: DailyService): string[] {
  const errors: string[] = [];
  const expected = specialForDayId(day.dayId);
  if (day.special !== expected) {
    errors.push(`${day.dayId}: special is ${String(day.special)}, weekday wants ${String(expected)}`);
    return errors;
  }
  if (expected === 'blind_friday' && !day.glasses.every((g) => g.twist === 'hidden_line')) {
    errors.push(`${day.dayId}: blind friday needs hidden_line on every glass`);
  }
  if (expected === 'saturday_rush' && day.glasses.length !== 7) {
    errors.push(`${day.dayId}: saturday rush needs 7 glasses, has ${day.glasses.length}`);
  }
  if (expected === 'sunday_boss') {
    const boss = day.glasses[4];
    if (day.glasses.length !== 5) {
      errors.push(`${day.dayId}: sunday boss needs 5 glasses, has ${day.glasses.length}`);
    } else if (boss?.twist !== 'layers3') {
      errors.push(`${day.dayId}: sunday boss glass must be a layers3 cocktail`);
    }
  }
  return errors;
}

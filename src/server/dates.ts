// src/server/dates.ts — P3 (Task 3)
// UTC dayId (YYYY-MM-DD) arithmetic. The Service du Jour changes at
// midnight UTC — 00:00 or 01:00 in Morocco depending on the season, which
// is why the nightly post states its dayId explicitly.
export const DAY_MS = 86_400_000;

const DAY_ID_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDayId(dayId: string): number | undefined {
  const match = DAY_ID_PATTERN.exec(dayId);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return undefined;
  }
  return ms;
}

export function toDayId(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True when the value is a real YYYY-MM-DD calendar date (no rollover). */
export function isDayId(dayId: string): boolean {
  return parseDayId(dayId) !== undefined;
}

/** Today's dayId in UTC. Pass `now` in tests to advance the date. */
export function todayDayId(now: Date = new Date()): string {
  return toDayId(now);
}

/** dayId shifted by n days. Undefined when the input is not a real date. */
export function addDays(dayId: string, n: number): string | undefined {
  const ms = parseDayId(dayId);
  if (ms === undefined) return undefined;
  return toDayId(new Date(ms + n * DAY_MS));
}

/** Whole days from `from` to `to` (to - from). Undefined when unparseable. */
export function diffDays(fromDayId: string, toDayId: string): number | undefined {
  const from = parseDayId(fromDayId);
  const to = parseDayId(toDayId);
  if (from === undefined || to === undefined) return undefined;
  return Math.round((to - from) / DAY_MS);
}

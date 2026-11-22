// src/server/content.test.ts — P3 (Task 2)
// The seed day must validate, lookups must resolve, and the validator
// must reject malformed content files (Task 5 runs it over 14 files).
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkSpecialCompliance } from './calendar';
import { allDays, getDay, latestDay, resolvePostDay, validateDailyService } from './content';
import { todayDayId } from './dates';
import { fallbackDay, fallbackNight } from './fallback';

const SEED_GLASSES = [
  { model: 'mug_giant', line: 0.78, flow: 1.0, twist: 'none', customer: 'giant' },
  { model: 'thimble', line: 0.6, flow: 0.6, twist: 'none', customer: 'fairy' },
  { model: 'goblet', line: 0.7, flow: 1.0, twist: 'steam', customer: 'ghost' },
  { model: 'tankard', line: 0.82, flow: 1.1, twist: 'tilt', customer: 'pirate' },
  { model: 'flute', line: 0.65, flow: 0.9, twist: 'layers2', customer: 'wizard' },
];

const SEED_DAY = {
  dayId: '2026-11-24',
  night: 24,
  location: 'cafe',
  glasses: SEED_GLASSES,
};

describe('content', () => {
  test('seed day matches the §10.1 example and validates', () => {
    const day = getDay('2026-11-24');
    assert.ok(day !== undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(day)), SEED_DAY);
  });

  test('resolvePostDay prefers the post dayId (authored, else fallback), else today', () => {
    assert.equal(resolvePostDay({ dayId: '2026-11-24' }).dayId, '2026-11-24');
    // Missing days play their own seeded night — the same one publishing used.
    assert.deepEqual(resolvePostDay({ dayId: '2026-11-23' }), fallbackDay('2026-11-23'));
    assert.deepEqual(resolvePostDay({ dayId: '2999-01-01' }), fallbackDay('2999-01-01'));
    assert.notEqual(resolvePostDay({ dayId: '2026-11-23' }).dayId, latestDay().dayId);
    // No (or no real) dayId: today's seeded night, never the latest day.
    const today = todayDayId();
    assert.deepEqual(resolvePostDay(undefined), fallbackDay(today));
    assert.deepEqual(resolvePostDay({}), fallbackDay(today));
    assert.deepEqual(resolvePostDay({ dayId: 'tomorrow' }), fallbackDay(today));
    assert.deepEqual(resolvePostDay({ dayId: '2026-02-30' }), fallbackDay(today));
  });

  test('a post with no valid dayId plays today, not the latest authored day', () => {
    const today = todayDayId();
    for (const postData of [undefined, {}, { dayId: 'tomorrow' }, { dayId: '2026-02-30' }]) {
      const day = resolvePostDay(postData);
      assert.equal(day.dayId, today);
      assert.equal(day.night, fallbackNight(today));
      assert.deepEqual(day, fallbackDay(today));
    }
  });

  test('a valid unknown date plays its own night, not the latest day', () => {
    const day = resolvePostDay({ dayId: '2026-11-23' });
    assert.equal(day.dayId, '2026-11-23');
    assert.equal(day.night, fallbackNight('2026-11-23'));
    assert.notEqual(day.dayId, latestDay().dayId);
  });

  test('an authored date still returns the authored day', () => {
    const authored = getDay('2026-11-24');
    assert.ok(authored !== undefined);
    assert.deepEqual(resolvePostDay({ dayId: '2026-11-24' }), authored);
  });

  test('an authored day wins over the fallback for the same date', () => {
    const authored = getDay('2026-11-24');
    assert.ok(authored !== undefined);
    assert.deepEqual(resolvePostDay({ dayId: '2026-11-24' }), authored);
    assert.notDeepEqual(fallbackDay('2026-11-24'), authored);
  });

  test('T5 acceptance: 14 December days, sequential nights, all compliant', () => {
    const days = allDays();
    const december = days.filter((day) => day.dayId.startsWith('2026-12-'));
    assert.equal(december.length, 14);
    december.forEach((day, i) => {
      assert.equal(day.dayId, `2026-12-${String(i + 1).padStart(2, '0')}`);
      assert.equal(day.night, 31 + i);
      assert.ok(typeof day.drinkOfTheDay === 'string' && day.drinkOfTheDay.length > 0);
      assert.deepEqual(checkSpecialCompliance(day), []);
    });
    assert.equal(latestDay().dayId, '2026-12-14');
  });

  test('validator accepts a saturday_rush with 7 glasses', () => {
    const rush = {
      ...SEED_DAY,
      special: 'saturday_rush',
      glasses: [...SEED_GLASSES, ...SEED_GLASSES.slice(0, 2)],
    };
    assert.equal(validateDailyService(rush)?.glasses.length, 7);
  });

  test('validator rejects malformed days', async () => {
    const bad = [
      { ...SEED_DAY, glasses: SEED_GLASSES.slice(0, 4) },
      { ...SEED_DAY, dayId: 'tomorrow' },
      { ...SEED_DAY, location: 'moon' },
      { ...SEED_DAY, special: 'mystery' },
      { ...SEED_DAY, drinkOfTheDay: 42 },
      { ...SEED_DAY, glasses: [...SEED_GLASSES.slice(0, 4), { ...SEED_GLASSES[0], line: 2 }] },
      { ...SEED_DAY, glasses: [...SEED_GLASSES.slice(0, 4), { ...SEED_GLASSES[0], twist: 'dance' }] },
      { ...SEED_DAY, glasses: [...SEED_GLASSES.slice(0, 4), { ...SEED_GLASSES[0], customer: '' }] },
      'just a string',
      undefined,
    ];
    for (const value of bad) {
      assert.equal(validateDailyService(value), undefined, JSON.stringify(value)?.slice(0, 80));
    }
  });
});

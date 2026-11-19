// src/server/content.test.ts — P3 (Task 2)
// The seed day must validate, lookups must resolve, and the validator
// must reject malformed content files (Task 5 runs it over 14 files).
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkSpecialCompliance } from './calendar';
import { allDays, getDay, latestDay, resolvePostDay, validateDailyService } from './content';

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

  test('resolvePostDay prefers the post dayId, else the latest day', () => {
    assert.equal(resolvePostDay({ dayId: '2026-11-24' }).dayId, '2026-11-24');
    assert.equal(resolvePostDay({ dayId: '2999-01-01' }).dayId, latestDay().dayId);
    assert.equal(resolvePostDay(undefined).dayId, latestDay().dayId);
    assert.equal(resolvePostDay({}).dayId, latestDay().dayId);
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

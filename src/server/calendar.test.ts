// src/server/calendar.test.ts — P3 (Task 5)
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { DailyService, Twist } from '../shared/types';
import { checkSpecialCompliance, specialForDayId } from './calendar';

function makeDay(dayId: string, special: DailyService['special'], twists: Twist[]): DailyService {
  const day: DailyService = {
    dayId,
    night: 31,
    location: 'cafe',
    glasses: twists.map((twist, i) => ({
      model: 'pint',
      line: 0.7,
      flow: 1.0,
      twist,
      customer: `customer-${i}`,
    })),
  };
  return special === undefined ? day : { ...day, special };
}

describe('calendar', () => {
  test('weekdays map to the right specials', () => {
    assert.equal(specialForDayId('2026-12-04'), 'blind_friday');
    assert.equal(specialForDayId('2026-12-05'), 'saturday_rush');
    assert.equal(specialForDayId('2026-12-06'), 'sunday_boss');
    assert.equal(specialForDayId('2026-12-11'), 'blind_friday');
    assert.equal(specialForDayId('2026-12-12'), 'saturday_rush');
    assert.equal(specialForDayId('2026-12-13'), 'sunday_boss');
    assert.equal(specialForDayId('2026-12-01'), undefined);
    assert.equal(specialForDayId('2026-12-14'), undefined);
    assert.equal(specialForDayId('not-a-day'), undefined);
  });

  test('compliant special nights pass', () => {
    assert.deepEqual(
      checkSpecialCompliance(
        makeDay('2026-12-04', 'blind_friday', ['hidden_line', 'hidden_line', 'hidden_line', 'hidden_line', 'hidden_line'])
      ),
      []
    );
    assert.deepEqual(
      checkSpecialCompliance(makeDay('2026-12-05', 'saturday_rush', ['none', 'none', 'none', 'none', 'none', 'none', 'none'])),
      []
    );
    assert.deepEqual(
      checkSpecialCompliance(makeDay('2026-12-06', 'sunday_boss', ['none', 'foam', 'none', 'steam', 'layers3'])),
      []
    );
    assert.deepEqual(checkSpecialCompliance(makeDay('2026-12-01', undefined, ['none', 'none', 'none', 'none', 'none'])), []);
  });

  test('mismatches are reported', () => {
    assert.equal(
      checkSpecialCompliance(makeDay('2026-12-04', 'blind_friday', ['none', 'none', 'none', 'none', 'none'])).length,
      1
    );
    assert.equal(
      checkSpecialCompliance(makeDay('2026-12-05', 'saturday_rush', ['none', 'none', 'none', 'none', 'none'])).length,
      1
    );
    assert.equal(
      checkSpecialCompliance(makeDay('2026-12-06', 'sunday_boss', ['none', 'none', 'none', 'none', 'none'])).length,
      1
    );
    assert.equal(
      checkSpecialCompliance(makeDay('2026-12-01', 'blind_friday', ['none', 'none', 'none', 'none', 'none'])).length,
      1
    );
    assert.equal(
      checkSpecialCompliance(makeDay('2026-12-04', undefined, ['none', 'none', 'none', 'none', 'none'])).length,
      1
    );
  });
});

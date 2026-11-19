// src/server/dates.test.ts — P3 (Task 3)
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { addDays, diffDays, toDayId, todayDayId } from './dates';

describe('dates', () => {
  test('todayDayId honors the given clock (UTC)', () => {
    assert.equal(todayDayId(new Date('2026-11-24T00:30:00.000Z')), '2026-11-24');
    assert.equal(todayDayId(new Date('2026-11-24T23:59:59.999Z')), '2026-11-24');
    assert.equal(toDayId(new Date('2026-12-31T12:00:00.000Z')), '2026-12-31');
  });

  test('addDays crosses month and year boundaries, leap day included', () => {
    assert.equal(addDays('2026-11-30', 1), '2026-12-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2026-11-24', -24), '2026-10-31');
  });

  test('diffDays counts whole days symmetrically', () => {
    assert.equal(diffDays('2026-11-24', '2026-11-25'), 1);
    assert.equal(diffDays('2026-11-25', '2026-11-24'), -1);
    assert.equal(diffDays('2026-11-24', '2026-11-24'), 0);
    assert.equal(diffDays('2026-11-24', '2026-12-01'), 7);
  });

  test('impossible dates are rejected, not rolled over', () => {
    assert.equal(addDays('2026-02-30', 1), undefined);
    assert.equal(addDays('tomorrow', 1), undefined);
    assert.equal(diffDays('2026-13-01', '2026-11-24'), undefined);
    assert.equal(diffDays('2026-11-24', '2026-11-32'), undefined);
  });
});

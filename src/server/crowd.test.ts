// src/server/crowd.test.ts — P3 (Task 4)
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { beatPercentFromScores, CROWD_MIN_PLAYERS, crowdLineFromStats, SEEDED_BEAT_PERCENT } from './crowd';

describe('crowd', () => {
  test('crowd line is seeded from the glass line below 5 pours', () => {
    assert.equal(crowdLineFromStats(2400, 4, 0.78), 0.78);
    assert.equal(crowdLineFromStats(0, 0, 0.78), 0.78);
  });

  test('crowd line averages the others from 5 pours up', () => {
    assert.equal(crowdLineFromStats(3000, CROWD_MIN_PLAYERS, 0.78), 0.6);
  });

  test('beatPercent is seeded below 5 players', () => {
    assert.equal(beatPercentFromScores([10, 20, 30, 40], 100), SEEDED_BEAT_PERCENT);
    assert.equal(beatPercentFromScores([], 100), SEEDED_BEAT_PERCENT);
  });

  test('beatPercent counts strictly worse players', () => {
    assert.equal(beatPercentFromScores([80, 80, 80, 80, 80], 90), 100);
    assert.equal(beatPercentFromScores([80, 80, 80, 80, 80], 80), 0);
    assert.equal(beatPercentFromScores([10, 20, 90, 95, 99], 50), 40);
  });
});

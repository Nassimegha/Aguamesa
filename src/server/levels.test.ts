// src/server/levels.test.ts — P3 (Task 2)
// Star thresholds come straight from each Level; no formula invented.
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Level } from '../shared/types';
import { getLevel, starsForTotal } from './levels';

describe('levels', () => {
  test('unknown levels are absent until P1 delivers levels/*.json', () => {
    assert.equal(getLevel('cafe-01'), undefined);
  });

  test('stars follow the level thresholds exactly', () => {
    const level: Level = {
      id: 'cafe-01',
      location: 'cafe',
      glasses: [],
      stars: [200, 300, 400],
    };
    assert.equal(starsForTotal(level, 0), 0);
    assert.equal(starsForTotal(level, 199), 0);
    assert.equal(starsForTotal(level, 200), 1);
    assert.equal(starsForTotal(level, 299), 1);
    assert.equal(starsForTotal(level, 300), 2);
    assert.equal(starsForTotal(level, 400), 3);
    assert.equal(starsForTotal(level, 999), 3);
  });
});

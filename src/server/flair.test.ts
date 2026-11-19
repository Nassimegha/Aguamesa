// src/server/flair.test.ts — P3 (Task 4)
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { flairText, refreshFlair, type FlairSetter } from './flair';
import { defaultPlayer } from './player';

describe('flair', () => {
  test('flair text matches the brief example', () => {
    const player = { ...defaultPlayer('nassime'), serverLevel: 12, streak: 12, bestStreak: 12 };
    assert.equal(flairText(player), '☕ Serveur Nv. 12 · 🔥 12 nuits');
  });

  test('no badge below 14, 🏅30 from 30 up (best streak keeps the badge)', () => {
    assert.equal(
      flairText({ ...defaultPlayer('a'), serverLevel: 2, streak: 5, bestStreak: 13 }),
      '☕ Serveur Nv. 2 · 🔥 5 nuits'
    );
    assert.equal(
      flairText({ ...defaultPlayer('b'), serverLevel: 9, streak: 2, bestStreak: 31 }),
      '☕ Serveur Nv. 9 · 🔥 2 nuits · 🏅30'
    );
  });

  test('refreshFlair reports setter failures instead of throwing', async () => {
    const failing: FlairSetter = {
      setPlayerFlair: async () => {
        throw new Error('no mod rights');
      },
    };
    const outcome = await refreshFlair(failing, 'aguamesa_dev', defaultPlayer('nassime'));
    assert.equal(outcome.ok, false);
  });
});

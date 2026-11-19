// src/server/streak.test.ts — P3 (Task 3)
// The 4 acceptance cases (continue, freeze, broken, milestone) plus the
// freeze economy and the same-day guard.
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { PlayerState } from '../shared/types';
import { defaultPlayer } from './player';
import { applyStreak, MAX_FREEZES, REWARD_BY_MILESTONE } from './streak';

function playerWith(overrides: Partial<PlayerState>): PlayerState {
  return { ...defaultPlayer('nassime'), ...overrides };
}

describe('streak', () => {
  test('first night ever starts the streak at 1', () => {
    const outcome = applyStreak(playerWith({ lastPlayedDayId: null }), '2026-11-24');
    assert.equal(outcome.player.streak, 1);
    assert.equal(outcome.player.bestStreak, 1);
    assert.equal(outcome.freezeUsed, false);
  });

  test('case 1/4: consecutive night continues (+1)', () => {
    const outcome = applyStreak(
      playerWith({ streak: 11, bestStreak: 15, lastPlayedDayId: '2026-11-23' }),
      '2026-11-24'
    );
    assert.equal(outcome.player.streak, 12);
    assert.equal(outcome.player.bestStreak, 15);
    assert.equal(outcome.freezeUsed, false);
    assert.equal(outcome.streakMilestone, undefined);
  });

  test('case 2/4: one missed night with a freeze keeps the streak', () => {
    const outcome = applyStreak(
      playerWith({ streak: 5, bestStreak: 9, streakFreezes: 1, lastPlayedDayId: '2026-11-22' }),
      '2026-11-24'
    );
    assert.equal(outcome.player.streak, 6);
    assert.equal(outcome.player.streakFreezes, 0);
    assert.equal(outcome.freezeUsed, true);
  });

  test('case 3/4: one missed night without a freeze restarts at 1, best kept', () => {
    const outcome = applyStreak(
      playerWith({ streak: 5, bestStreak: 9, streakFreezes: 0, lastPlayedDayId: '2026-11-22' }),
      '2026-11-24'
    );
    assert.equal(outcome.player.streak, 1);
    assert.equal(outcome.player.bestStreak, 9);
    assert.equal(outcome.freezeUsed, false);
  });

  test('case 3b/4: two missed nights break through a freeze', () => {
    const outcome = applyStreak(
      playerWith({ streak: 5, bestStreak: 9, streakFreezes: 2, lastPlayedDayId: '2026-11-21' }),
      '2026-11-24'
    );
    assert.equal(outcome.player.streak, 1);
    assert.equal(outcome.freezeUsed, false);
  });

  test('case 4/4: milestones report once and grant their reward', () => {
    const outcome = applyStreak(
      playerWith({ streak: 2, bestStreak: 2, lastPlayedDayId: '2026-11-23', decor: [] }),
      '2026-11-24'
    );
    assert.equal(outcome.player.streak, 3);
    assert.equal(outcome.streakMilestone, 3);
    assert.ok(outcome.player.decor.includes(REWARD_BY_MILESTONE[3]));
  });

  test('every 7th night earns a freeze, capped at 2', () => {
    const seventh = applyStreak(
      playerWith({ streak: 6, bestStreak: 6, streakFreezes: 0, lastPlayedDayId: '2026-11-23' }),
      '2026-11-24'
    );
    assert.equal(seventh.player.streak, 7);
    assert.equal(seventh.player.streakFreezes, 1);
    assert.equal(seventh.streakMilestone, 7);
    const capped = applyStreak(
      playerWith({ streak: 13, bestStreak: 13, streakFreezes: 2, lastPlayedDayId: '2026-11-23' }),
      '2026-11-24'
    );
    assert.equal(capped.player.streakFreezes, MAX_FREEZES);
  });

  test('tips bonus is +1%/night capped at +30%', () => {
    const low = applyStreak(playerWith({ lastPlayedDayId: null }), '2026-11-24');
    assert.equal(low.tipsMultiplier, 1.01);
    const high = applyStreak(
      playerWith({ streak: 50, bestStreak: 50, lastPlayedDayId: '2026-11-23' }),
      '2026-11-24'
    );
    assert.equal(high.tipsMultiplier, 1.3);
  });

  test('same-day replay is a no-op (no double milestone, no double freeze)', () => {
    const before = playerWith({ streak: 7, bestStreak: 7, streakFreezes: 1, lastPlayedDayId: '2026-11-24' });
    const outcome = applyStreak(before, '2026-11-24');
    assert.deepEqual(outcome.player, before);
    assert.equal(outcome.streakMilestone, undefined);
  });
});

// src/server/night.test.ts — P3 (Task 3)
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { DailyService } from '../shared/types';
import { getDay } from './content';
import { MemoryStore } from './memoryStore';
import { buildShareText, finishNight } from './night';
import { defaultPlayer } from './player';
import { allBoardKey, dayBoardKey, poursKey, streakBoardKey } from './redis';

function makeDay(dayId: string, night: number): DailyService {
  const day: DailyService = {
    dayId,
    night,
    location: 'cafe',
    glasses: Array.from({ length: 5 }, (_, i) => ({
      model: 'pint',
      line: 0.7,
      flow: 1.0,
      twist: 'none',
      customer: `customer-${i}`,
    })),
  };
  return day;
}

async function seedPours(store: MemoryStore, dayId: string, username: string, scores: number[]) {
  const fields: Record<string, string> = {};
  scores.forEach((score, i) => {
    fields[String(i)] = JSON.stringify({
      score,
      level: 0.7,
      overflow: false,
      crowdLine: 0.7,
      beatPercent: 50,
    });
  });
  await store.hSet(poursKey(dayId, username), fields);
}

describe('night', () => {
  test('shareText matches the §6.1 example exactly on §10 data', () => {
    const day = getDay('2026-11-24');
    assert.ok(day !== undefined);
    assert.equal(
      buildShareText(
        day.night,
        day.glasses.map((g) => g.customer),
        [98, 100, 71, 88, 94],
        451,
        12
      ),
      '☕ Nuit #24 🍺98 🧚100 👻71 ⛵88 🧙94 = 451 · 🔥12'
    );
  });

  test('finish shareText names the seeded castle guests, not GlassSpec.customer', async () => {
    const store = new MemoryStore();
    const day = makeDay('2026-11-24', 24);
    // Decoys: location cafe + classic customers would give 🍺×5 if the
    // server still read the specs. The client shows the seeded castle
    // pick instead, so the server must too.
    for (const glass of day.glasses) glass.customer = 'giant';
    await seedPours(store, day.dayId, 'nassime', [98, 100, 71, 88, 94]);
    const outcome = await finishNight(store, day, 'nassime', defaultPlayer('nassime'));
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(
      outcome.summary.shareText,
      '☕ Nuit #24 🎃98 ☕100 ⭐71 ☕88 🍻94 = 451 · 🔥1'
    );
    assert.ok(!outcome.summary.shareText.includes('🍺'));
  });

  test('finish computes total, tips with streak bonus, rank and persists everything', async () => {
    const store = new MemoryStore();
    const day = makeDay('2026-11-24', 24);
    await seedPours(store, day.dayId, 'nassime', [98, 100, 71, 88, 94]);
    const player = {
      ...defaultPlayer('nassime'),
      streak: 11,
      bestStreak: 11,
      lastPlayedDayId: '2026-11-23',
      tips: 340,
    };
    const outcome = await finishNight(store, day, 'nassime', player);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.summary.total, 451);
    assert.equal(outcome.summary.streak, 12);
    // 451 * 30% * 1.12 (12-night bonus) = 151.5 → 152.
    assert.equal(outcome.summary.tips, 152);
    assert.equal(outcome.summary.rank, 1);
    assert.equal(outcome.summary.freezeUsed, false);
    // Player persisted with the new streak, tips and level.
    const reloaded = await store.get('player:nassime');
    assert.ok(reloaded !== undefined && reloaded.includes('"streak":12'));
    assert.ok(reloaded.includes('"tips":492'));
    assert.equal(await store.zScore(dayBoardKey(day.dayId), 'nassime'), 451);
    assert.equal(await store.zScore(allBoardKey(), 'nassime'), 451);
    assert.equal(await store.zScore(streakBoardKey(), 'nassime'), 12);
  });

  test('finish is idempotent: the second call returns the stored summary', async () => {
    const store = new MemoryStore();
    const day = makeDay('2026-11-24', 24);
    await seedPours(store, day.dayId, 'marwa', [80, 80, 80, 80, 80]);
    const first = await finishNight(store, day, 'marwa', defaultPlayer('marwa'));
    const second = await finishNight(store, day, 'marwa', defaultPlayer('marwa'));
    assert.equal(first.ok && second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.deepEqual(second.summary, first.summary);
  });

  test('finish refuses while a glass is still unpoured', async () => {
    const store = new MemoryStore();
    const day = makeDay('2026-11-24', 24);
    await seedPours(store, day.dayId, 'mohamed', [80, 80, 80, 80]);
    const outcome = await finishNight(store, day, 'mohamed', defaultPlayer('mohamed'));
    assert.equal(outcome.ok, false);
  });

  test('three players rank by total, ties share the rank', async () => {
    const store = new MemoryStore();
    const day = makeDay('2026-11-25', 25);
    await seedPours(store, day.dayId, 'a', [100, 100, 100, 100, 100]);
    await seedPours(store, day.dayId, 'b', [90, 90, 90, 90, 90]);
    await seedPours(store, day.dayId, 'c', [90, 90, 90, 90, 90]);
    const ra = await finishNight(store, day, 'a', defaultPlayer('a'));
    const rb = await finishNight(store, day, 'b', defaultPlayer('b'));
    const rc = await finishNight(store, day, 'c', defaultPlayer('c'));
    assert.equal(ra.ok && rb.ok && rc.ok, true);
    if (!ra.ok || !rb.ok || !rc.ok) return;
    assert.equal(ra.summary.rank, 1);
    assert.equal(rb.summary.rank, 2);
    assert.equal(rc.summary.rank, 2);
  });

  test('all-time boards keep the best, never a worse replay', async () => {
    const store = new MemoryStore();
    const dayA = makeDay('2026-11-24', 24);
    const dayB = makeDay('2026-11-25', 25);
    await seedPours(store, dayA.dayId, 'nassime', [100, 100, 100, 100, 100]);
    await seedPours(store, dayB.dayId, 'nassime', [10, 10, 10, 10, 10]);
    await finishNight(store, dayA, 'nassime', defaultPlayer('nassime'));
    const second = await finishNight(
      store,
      dayB,
      'nassime',
      { ...defaultPlayer('nassime'), streak: 1, lastPlayedDayId: dayA.dayId }
    );
    assert.equal(second.ok, true);
    assert.equal(await store.zScore(allBoardKey(), 'nassime'), 500);
  });

  test('three consecutive nights build a 🔥3 streak (date-advance acceptance)', async () => {
    const store = new MemoryStore();
    const days = [makeDay('2026-11-24', 24), makeDay('2026-11-25', 25), makeDay('2026-11-26', 26)];
    let player = defaultPlayer('nassime');
    for (const [index, day] of days.entries()) {
      await seedPours(store, day.dayId, 'nassime', [80, 80, 80, 80, 80]);
      const outcome = await finishNight(store, day, 'nassime', player);
      assert.equal(outcome.ok, true);
      if (!outcome.ok) return;
      assert.equal(outcome.summary.streak, index + 1);
      // Next night starts from the persisted profile, like the real route.
      player = {
        ...player,
        streak: outcome.summary.streak,
        bestStreak: Math.max(player.bestStreak, outcome.summary.streak),
        lastPlayedDayId: day.dayId,
        tips: player.tips + outcome.summary.tips,
      };
    }
    // Night 3 hit the first milestone.
    const last = await store.get('player:nassime');
    assert.ok(last !== undefined && last.includes('reward_cafe_deco_3'));
  });

  test('a skipped night with a freeze keeps the streak, without one it restarts', async () => {
    const store = new MemoryStore();
    const dayA = makeDay('2026-11-24', 24);
    const dayC = makeDay('2026-11-26', 26);
    for (const username of ['frozen', 'naked']) {
      await seedPours(store, dayA.dayId, username, [80, 80, 80, 80, 80]);
      await seedPours(store, dayC.dayId, username, [80, 80, 80, 80, 80]);
    }
    const withFreeze = { ...defaultPlayer('frozen'), streakFreezes: 1 };
    await finishNight(store, dayA, 'frozen', withFreeze);
    const kept = await finishNight(
      store,
      dayC,
      'frozen',
      { ...withFreeze, streak: 1, lastPlayedDayId: dayA.dayId }
    );
    assert.equal(kept.ok, true);
    if (!kept.ok) return;
    assert.equal(kept.summary.streak, 2);
    assert.equal(kept.summary.freezeUsed, true);

    await finishNight(store, dayA, 'naked', defaultPlayer('naked'));
    const reset = await finishNight(
      store,
      dayC,
      'naked',
      { ...defaultPlayer('naked'), streak: 1, lastPlayedDayId: dayA.dayId }
    );
    assert.equal(reset.ok, true);
    if (!reset.ok) return;
    assert.equal(reset.summary.streak, 1);
    assert.equal(reset.summary.freezeUsed, false);
  });

  test('a milestone night carries the milestone and the reward', async () => {
    const store = new MemoryStore();
    const day = makeDay('2026-11-26', 26);
    await seedPours(store, day.dayId, 'marwa', [80, 80, 80, 80, 80]);
    const outcome = await finishNight(
      store,
      day,
      'marwa',
      { ...defaultPlayer('marwa'), streak: 2, bestStreak: 2, lastPlayedDayId: '2026-11-25' }
    );
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.summary.streakMilestone, 3);
    const reloaded = await store.get('player:marwa');
    assert.ok(reloaded !== undefined && reloaded.includes('reward_cafe_deco_3'));
  });
});

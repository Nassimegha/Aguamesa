// src/server/leaderboard.test.ts — P3 (Task 4)
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getLeaderboard, LEADERBOARD_TOP } from './leaderboard';
import { MemoryStore } from './memoryStore';
import { defaultPlayer } from './player';
import { dayBoardKey, playerKey } from './redis';

async function seedBoard(store: MemoryStore, dayId: string, totals: Record<string, number>) {
  for (const [username, total] of Object.entries(totals)) {
    await store.zAdd(dayBoardKey(dayId), { member: username, score: total });
  }
}

async function seedPlayer(store: MemoryStore, username: string, streak: number) {
  await store.set(playerKey(username), JSON.stringify({ ...defaultPlayer(username), streak }));
}

describe('leaderboard', () => {
  test('empty board returns no rows', async () => {
    const store = new MemoryStore();
    assert.deepEqual(await getLeaderboard(store, 'day', '2026-11-24', 'nassime'), []);
  });

  test('rows rank by total descending with streaks from profiles', async () => {
    const store = new MemoryStore();
    await seedBoard(store, '2026-11-24', { nassime: 451, marwa: 432, mohamed: 418 });
    await seedPlayer(store, 'nassime', 12);
    await seedPlayer(store, 'marwa', 9);
    await seedPlayer(store, 'mohamed', 3);
    const rows = await getLeaderboard(store, 'day', '2026-11-24', 'marwa');
    assert.deepEqual(rows, [
      { rank: 1, username: 'nassime', total: 451, streak: 12 },
      { rank: 2, username: 'marwa', total: 432, streak: 9 },
      { rank: 3, username: 'mohamed', total: 418, streak: 3 },
    ]);
  });

  test('missing profiles read as streak 0, never crash', async () => {
    const store = new MemoryStore();
    await seedBoard(store, '2026-11-24', { ghost: 100 });
    const rows = await getLeaderboard(store, 'day', '2026-11-24', 'ghost');
    assert.deepEqual(rows, [{ rank: 1, username: 'ghost', total: 100, streak: 0 }]);
  });

  test('top 50 plus the caller with its real rank', async () => {
    const store = new MemoryStore();
    const totals: Record<string, number> = {};
    for (let i = 0; i < 60; i += 1) {
      totals[`user-${String(i).padStart(2, '0')}`] = 600 - i;
    }
    await seedBoard(store, '2026-11-24', totals);
    const rows = await getLeaderboard(store, 'day', '2026-11-24', 'user-59');
    assert.equal(rows.length, LEADERBOARD_TOP + 1);
    assert.equal(rows[0]?.rank, 1);
    assert.equal(rows[0]?.username, 'user-00');
    assert.equal(rows[LEADERBOARD_TOP - 1]?.username, 'user-49');
    const self = rows[rows.length - 1];
    assert.deepEqual(self, { rank: 60, username: 'user-59', total: 541, streak: 0 });
  });

  test('a caller inside the top 50 is not duplicated', async () => {
    const store = new MemoryStore();
    await seedBoard(store, '2026-11-24', { a: 300, b: 200 });
    const rows = await getLeaderboard(store, 'day', '2026-11-24', 'a');
    assert.equal(rows.length, 2);
  });
});

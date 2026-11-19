// src/server/player.test.ts — P3 (Task 2)
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryStore } from './memoryStore';
import { getPlayedToday, loadOrCreatePlayer, savePlayer } from './player';
import { playerKey, poursKey } from './redis';

describe('player', () => {
  test('first sight creates and stores a default profile', async () => {
    const store = new MemoryStore();
    const player = await loadOrCreatePlayer(store, 'nassime');
    assert.equal(player.username, 'nassime');
    assert.equal(player.streak, 0);
    assert.equal(player.lastPlayedDayId, null);
    const again = await loadOrCreatePlayer(store, 'nassime');
    assert.deepEqual(again, player);
  });

  test('a corrupt profile resets to defaults instead of crashing', async () => {
    const store = new MemoryStore();
    await store.set(playerKey('nassime'), 'garbage{{{');
    const player = await loadOrCreatePlayer(store, 'nassime');
    assert.equal(player.username, 'nassime');
    assert.equal(player.streak, 0);
  });

  test('savePlayer round-trips profile changes', async () => {
    const store = new MemoryStore();
    const player = await loadOrCreatePlayer(store, 'marwa');
    await savePlayer(store, { ...player, tips: 42 });
    const reloaded = await loadOrCreatePlayer(store, 'marwa');
    assert.equal(reloaded.tips, 42);
  });

  test('playedToday flags follow the recorded pours and the glass count', async () => {
    const store = new MemoryStore();
    await store.hSet(poursKey('2026-11-24', 'mohamed'), { '0': '{}', '3': '{}' });
    assert.deepEqual(await getPlayedToday(store, '2026-11-24', 'mohamed', 5), [
      true,
      false,
      false,
      true,
      false,
    ]);
    assert.equal((await getPlayedToday(store, '2026-11-24', 'mohamed', 7)).length, 7);
  });
});

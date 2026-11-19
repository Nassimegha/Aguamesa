// src/server/memoryStore.test.ts — P3 (Task 2)
// The game logic leans on exact Redis semantics (first-writer-wins,
// ascending ranks, inclusive ranges), so the in-memory twin is tested
// against those semantics here.
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryStore } from './memoryStore';

describe('MemoryStore', () => {
  test('hSetNX lets the first writer win', async () => {
    const store = new MemoryStore();
    assert.equal(await store.hSetNX('h', 'f', 'one'), 1);
    assert.equal(await store.hSetNX('h', 'f', 'two'), 0);
    assert.equal(await store.hGet('h', 'f'), 'one');
  });

  test('hIncrBy accumulates from zero', async () => {
    const store = new MemoryStore();
    assert.equal(await store.hIncrBy('h', 'n', 3), 3);
    assert.equal(await store.hIncrBy('h', 'n', 2), 5);
  });

  test('zset ranks ascend by score, ties break by member', async () => {
    const store = new MemoryStore();
    await store.zAdd('z', { member: 'b', score: 80 }, { member: 'a', score: 80 });
    await store.zAdd('z', { member: 'c', score: 90 });
    assert.equal(await store.zCard('z'), 3);
    assert.equal(await store.zRank('z', 'a'), 0);
    assert.equal(await store.zRank('z', 'b'), 1);
    assert.equal(await store.zRank('z', 'c'), 2);
    assert.equal(await store.zRank('z', 'missing'), undefined);
  });

  test('zAdd on an existing member updates the score without growing the set', async () => {
    const store = new MemoryStore();
    assert.equal(await store.zAdd('z', { member: 'a', score: 10 }), 1);
    assert.equal(await store.zAdd('z', { member: 'a', score: 20 }), 0);
    assert.equal(await store.zCard('z'), 1);
    assert.equal(await store.zScore('z', 'a'), 20);
  });

  test('incrBy accumulates on strings', async () => {
    const store = new MemoryStore();
    assert.equal(await store.incrBy('n', 1), 1);
    assert.equal(await store.incrBy('n', 4), 5);
  });

  test('mGet returns values with null for missing keys', async () => {
    const store = new MemoryStore();
    await store.set('a', '1');
    assert.deepEqual(await store.mGet(['a', 'missing']), ['1', null]);
  });

  test('zRange slices ascending with an inclusive stop (-1 = last)', async () => {
    const store = new MemoryStore();
    await store.zAdd(
      'z',
      { member: 'a', score: 10 },
      { member: 'b', score: 20 },
      { member: 'c', score: 30 }
    );
    assert.deepEqual(await store.zRange('z', 0, -1), [
      { member: 'a', score: 10 },
      { member: 'b', score: 20 },
      { member: 'c', score: 30 },
    ]);
    assert.deepEqual(await store.zRange('z', 1, 1), [{ member: 'b', score: 20 }]);
  });
});

// src/server/rateLimit.test.ts — P3 (Task 6)
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryStore } from './memoryStore';
import { checkRateLimit } from './rateLimit';

describe('rateLimit', () => {
  test('allows up to the limit, then blocks', async () => {
    const store = new MemoryStore();
    const rule = { limit: 3, windowSec: 60 };
    const now = 1_700_000_000_000;
    for (let i = 0; i < 3; i += 1) {
      const check = await checkRateLimit(store, 'nassime', 'pour', rule, now);
      assert.equal(check.allowed, true);
    }
    const blocked = await checkRateLimit(store, 'nassime', 'pour', rule, now);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
  });

  test('windows roll over and users/routes are isolated', async () => {
    const store = new MemoryStore();
    const rule = { limit: 1, windowSec: 60 };
    const now = 1_700_000_000_000;
    assert.equal((await checkRateLimit(store, 'a', 'pour', rule, now)).allowed, true);
    assert.equal((await checkRateLimit(store, 'a', 'pour', rule, now)).allowed, false);
    assert.equal((await checkRateLimit(store, 'b', 'pour', rule, now)).allowed, true);
    assert.equal((await checkRateLimit(store, 'a', 'share', rule, now)).allowed, true);
    assert.equal((await checkRateLimit(store, 'a', 'pour', rule, now + 61_000)).allowed, true);
  });
});

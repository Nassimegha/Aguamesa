// src/shared/guests.test.ts — P3 (share-text fix)
// The seeded guest pick both sides share: determinism, known vectors,
// emoji stability, and the roster sync with the client manifest.

/// <reference types="node" />

import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { CUSTOMER_ROSTER } from './customerRoster';
import {
  REAL_SHIFT_LOCATION,
  emojiForCustomer,
  pickGuestIds,
  type GuestRosterEntry,
} from './guests';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const TINY: readonly GuestRosterEntry[] = [
  { id: 'a1', location: 'cafe' },
  { id: 'a2', location: 'cafe' },
  { id: 'b1', location: 'beach' },
];

describe('guests', () => {
  test('the real night plays at castle on both sides', () => {
    assert.equal(REAL_SHIFT_LOCATION, 'castle');
  });

  test('seeded pick is deterministic', () => {
    const first = pickGuestIds(CUSTOMER_ROSTER, 'castle', 5, '2026-11-24');
    const second = pickGuestIds(CUSTOMER_ROSTER, 'castle', 5, '2026-11-24');
    assert.deepEqual(second, first);
  });

  test('known vector: night 24 castle guests', () => {
    assert.deepEqual(pickGuestIds(CUSTOMER_ROSTER, 'castle', 5, '2026-11-24'), [
      'alchemist',
      'zombie',
      'spider',
      'banshee',
      'gargoyle',
    ]);
  });

  test('different nights pick different orders', () => {
    const a = pickGuestIds(CUSTOMER_ROSTER, 'castle', 30, '2026-11-24');
    const b = pickGuestIds(CUSTOMER_ROSTER, 'castle', 30, '2026-11-25');
    assert.notDeepEqual(b, a);
  });

  test('unseeded pick draws from the location roster', () => {
    const ids = pickGuestIds(CUSTOMER_ROSTER, 'beach', 5);
    assert.equal(ids.length, 5);
    assert.equal(new Set(ids).size, 5);
    const beach = new Set(
      CUSTOMER_ROSTER.filter((c) => c.location === 'beach').map((c) => c.id)
    );
    for (const id of ids) assert.ok(beach.has(id));
  });

  test('count beyond the roster cycles in shuffled order', () => {
    const ids = pickGuestIds(TINY, 'cafe', 5, 'seed');
    assert.equal(ids.length, 5);
    assert.deepEqual(ids.slice(2, 4), ids.slice(0, 2));
    assert.deepEqual(ids.slice(4), ids.slice(0, 1));
  });

  test('empty roster: zero guests is fine, more throws', () => {
    assert.deepEqual(pickGuestIds(TINY, 'castle', 0, 'seed'), []);
    assert.throws(() => pickGuestIds(TINY, 'castle', 1, 'seed'), /no customers for location/);
  });

  test('classic five keep their §6.1 emojis', () => {
    assert.deepEqual(
      ['giant', 'fairy', 'ghost', 'pirate', 'wizard'].map(emojiForCustomer),
      ['🍺', '🧚', '👻', '⛵', '🧙']
    );
  });

  test('other customers get a stable, non-empty glyph', () => {
    for (const id of ['alchemist', 'zombie', 'spider', 'banshee', 'gargoyle', 'customer-0', '']) {
      const glyph = emojiForCustomer(id);
      assert.ok(glyph.length > 0);
      assert.equal(emojiForCustomer(id), glyph);
    }
  });

  test('CUSTOMER_ROSTER matches the client manifest (order included)', () => {
    const url = new URL('../client/world/customers.manifest.json', import.meta.url);
    const raw: unknown = JSON.parse(readFileSync(url, 'utf8'));
    assert.ok(Array.isArray(raw), 'manifest must be an array');
    const pairs = raw.map((entry: unknown) => {
      assert.ok(
        isRecord(entry) && typeof entry['id'] === 'string' && typeof entry['location'] === 'string'
      );
      return { id: entry['id'], location: entry['location'] };
    });
    assert.equal(
      CUSTOMER_ROSTER.length,
      pairs.length,
      'roster length drifted: regenerate with python3 tools/gen_customer_roster.py'
    );
    assert.deepEqual([...CUSTOMER_ROSTER], pairs);
  });
});

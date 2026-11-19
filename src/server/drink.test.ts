// src/server/drink.test.ts — P3 (Task 5)
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryStore } from './memoryStore';
import {
  liveDrinkForDay,
  parseDrinkProposal,
  pickAndStoreDrink,
  pickDrinkCandidate,
  pickedDrinkForPost,
  withLiveDrink,
  dayDrinkKey,
  type DrinkComments,
} from './drink';
import { getDay } from './content';

function fakeComments(list: { id: string; body: string; score: number }[], fail = false): DrinkComments {
  return {
    listPostComments: async () => {
      if (fail) throw new Error('reddit is down');
      return list;
    },
  };
}

describe('drink', () => {
  test('only !boisson-prefixed, single-line, short bodies qualify', () => {
    assert.equal(parseDrinkProposal('!boisson Chocolat viennois'), 'Chocolat viennois');
    assert.equal(parseDrinkProposal('  !boisson   Thé  '), 'Thé');
    assert.equal(parseDrinkProposal('!boisson'), undefined);
    assert.equal(parseDrinkProposal('boisson Chocolat'), undefined);
    assert.equal(parseDrinkProposal('!boisson a\nb'), undefined);
    assert.equal(parseDrinkProposal(`!boisson ${'x'.repeat(61)}`), undefined);
    assert.equal(parseDrinkProposal('I love !boisson Chocolat'), undefined);
  });

  test('top score wins, ties break toward the earliest', () => {
    const comments = [
      { id: 'c1', body: '!boisson Thé', score: 5 },
      { id: 'c2', body: 'nice game!', score: 99 },
      { id: 'c3', body: '!boisson Chocolat', score: 12 },
      { id: 'c4', body: '!boisson Café', score: 12 },
    ];
    assert.deepEqual(pickDrinkCandidate(comments), { text: 'Chocolat', commentId: 'c3', score: 12 });
    assert.equal(pickDrinkCandidate([{ id: 'c9', body: 'no proposal', score: 3 }]), undefined);
  });

  test('mod pick stores the winner for the post', async () => {
    const store = new MemoryStore();
    const outcome = await pickAndStoreDrink(
      store,
      fakeComments([{ id: 'c3', body: '!boisson Chocolat', score: 12 }]),
      't3_night'
    );
    assert.equal(outcome.ok, true);
    assert.equal(await pickedDrinkForPost(store, 't3_night'), 'Chocolat');
  });

  test('empty and failing comment reads surface as errors', async () => {
    const store = new MemoryStore();
    const empty = await pickAndStoreDrink(store, fakeComments([]), 't3_night');
    assert.equal(empty.ok, false);
    const failing = await pickAndStoreDrink(store, fakeComments([], true), 't3_night');
    assert.equal(failing.ok, false);
    assert.equal(await pickedDrinkForPost(store, 't3_night'), undefined);
  });

  test('live overlay wins over the content default, absence keeps it', async () => {
    const store = new MemoryStore();
    const day = getDay('2026-11-24');
    assert.ok(day !== undefined);
    assert.equal(withLiveDrink(day, undefined).drinkOfTheDay, day.drinkOfTheDay);
    await store.set(dayDrinkKey('2026-11-24'), 'Thé à la menthe');
    assert.equal(
      withLiveDrink(day, await liveDrinkForDay(store, '2026-11-24')).drinkOfTheDay,
      'Thé à la menthe'
    );
  });
});

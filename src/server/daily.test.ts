// src/server/daily.test.ts — P3 (Task 3)
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CUSTOMER_ROSTER } from '../shared/customerRoster';
import { checkSpecialCompliance } from './calendar';
import { resolvePostDay, validateDailyService } from './content';
import { nightPostTitle, publishNight, resolveDayForPost, type NightPoster } from './daily';
import { fallbackDay, fallbackNight } from './fallback';
import { MemoryStore } from './memoryStore';

function fakePoster(fail = false): NightPoster & { calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    submitNightPost: async (input) => {
      calls += 1;
      if (fail) throw new Error('reddit is down');
      return { postId: `t3_post_for_${input.dayId}` };
    },
  };
}

describe('daily', () => {
  test('post title matches the brief wording', () => {
    assert.equal(nightPostTitle(24), 'Service de la nuit #24');
  });

  test('known days resolve from content, unknown days from the seeded fallback', () => {
    const known = resolveDayForPost('2026-11-24');
    assert.equal(known.fromFallback, false);
    assert.equal(known.day.night, 24);
    const missing = resolveDayForPost('2026-12-25');
    assert.equal(missing.fromFallback, true);
    assert.ok(validateDailyService(missing.day) !== undefined);
  });

  test('fallback nights are deterministic per dayId and numbered from night 24', () => {
    assert.deepEqual(fallbackDay('2026-11-23'), fallbackDay('2026-11-23'));
    assert.deepEqual(fallbackDay('2026-12-15'), fallbackDay('2026-12-15'));
    assert.equal(fallbackNight('2026-11-23'), 23);
    assert.equal(fallbackNight('2026-11-24'), 24);
    assert.equal(fallbackNight('2026-11-25'), 25);
    assert.equal(fallbackNight('not-a-day'), 1);
    assert.ok(
      JSON.stringify(fallbackDay('2026-11-23')) !== JSON.stringify(fallbackDay('2026-11-24'))
    );
    assert.ok(
      JSON.stringify(fallbackDay('2026-12-15')) !== JSON.stringify(fallbackDay('2026-12-16'))
    );
  });

  test('fallback night deals the location first, then that location roster guests', () => {
    const day = fallbackDay('2026-11-23');
    assert.equal(day.dayId, '2026-11-23');
    assert.equal(day.night, 23);
    assert.ok(['cafe', 'beach', 'chalet', 'fair', 'pirate', 'castle'].includes(day.location));
    assert.equal(day.glasses.length, 5);
    assert.equal(day.drinkOfTheDay, undefined);
    const rosterIds = new Set(
      CUSTOMER_ROSTER.filter((c) => c.location === day.location).map((c) => c.id)
    );
    assert.equal(rosterIds.size, 30);
    const seen = new Set<string>();
    for (const glass of day.glasses) {
      assert.ok(rosterIds.has(glass.customer), `guest ${glass.customer} is not from ${day.location}`);
      assert.ok(!seen.has(glass.customer), `duplicate guest ${glass.customer}`);
      seen.add(glass.customer);
      assert.ok(glass.line >= 0.6 && glass.line <= 0.85, `line ${glass.line} out of range`);
      assert.ok(glass.flow >= 0.7 && glass.flow <= 1.3, `flow ${glass.flow} out of range`);
      assert.ok(['none', 'foam', 'steam', 'ice'].includes(glass.twist));
    }
    assert.ok(validateDailyService(day) !== undefined);
    assert.deepEqual(checkSpecialCompliance(day), []);
  });

  test('fallback honors the week calendar (blind, rush, boss)', () => {
    const friday = fallbackDay('2026-12-18');
    assert.equal(friday.special, 'blind_friday');
    assert.ok(friday.glasses.every((g) => g.twist === 'hidden_line'));
    const saturday = fallbackDay('2026-12-19');
    assert.equal(saturday.special, 'saturday_rush');
    assert.equal(saturday.glasses.length, 7);
    const rushGuests = saturday.glasses.map((g) => g.customer);
    assert.equal(new Set(rushGuests).size, 7);
    const sunday = fallbackDay('2026-12-20');
    assert.equal(sunday.special, 'sunday_boss');
    assert.equal(sunday.glasses.length, 5);
    assert.equal(sunday.glasses[4]?.twist, 'layers3');
    const monday = fallbackDay('2026-12-21');
    assert.equal(monday.special, undefined);
    assert.equal(monday.glasses.length, 5);
    for (const day of [friday, saturday, sunday, monday]) {
      assert.equal(day.drinkOfTheDay, undefined);
      assert.ok(validateDailyService(day) !== undefined);
      assert.deepEqual(checkSpecialCompliance(day), []);
    }
  });

  test('publishing and playing agree: authored or fallback, same night', () => {
    for (const dayId of ['2026-11-23', '2026-11-25', '2026-11-24']) {
      const { day } = resolveDayForPost(dayId);
      assert.deepEqual(resolvePostDay({ dayId }), day, dayId);
    }
    assert.equal(resolveDayForPost('2026-11-23').fromFallback, true);
    assert.equal(resolveDayForPost('2026-11-24').fromFallback, false);
  });

  test('publishNight carries yesterday mod-picked drink into the new day', async () => {
    const store = new MemoryStore();
    const poster = fakePoster();
    const first = await publishNight(store, poster, 'aguamesa_dev', '2026-12-15');
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.drinkOfTheDay, undefined);
    await store.set('drink:picked:t3_post_for_2026-12-15', 'Thé à la menthe');
    const second = await publishNight(store, poster, 'aguamesa_dev', '2026-12-16');
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.drinkOfTheDay, 'Thé à la menthe');
    assert.equal(await store.get('drink:day:2026-12-16'), 'Thé à la menthe');
  });

  test('publishNight posts once per day and replays the stored id', async () => {
    const store = new MemoryStore();
    const poster = fakePoster();
    const first = await publishNight(store, poster, 'aguamesa_dev', '2026-11-24');
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.postId, 't3_post_for_2026-11-24');
    assert.equal(first.night, 24);
    assert.equal(first.fromFallback, false);
    assert.equal(first.replayed, false);
    const second = await publishNight(store, poster, 'aguamesa_dev', '2026-11-24');
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.postId, first.postId);
    assert.equal(second.replayed, true);
    assert.equal(poster.calls(), 1);
  });

  test('publishNight reports poster failures and bad input without storing', async () => {
    const store = new MemoryStore();
    const failing = await publishNight(store, fakePoster(true), 'aguamesa_dev', '2026-11-27');
    assert.equal(failing.ok, false);
    const noSub = await publishNight(store, fakePoster(), '', '2026-11-27');
    assert.equal(noSub.ok, false);
    assert.equal(await store.get('day:2026-11-27:post'), undefined);
  });
});

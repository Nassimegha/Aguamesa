// src/server/share.test.ts — P3 (Task 4)
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryStore } from './memoryStore';
import { nightKey } from './redis';
import { shareNight, type CommentPoster } from './share';

const SUMMARY = {
  dayId: '2026-11-24',
  scores: [98, 100, 71, 88, 94],
  total: 451,
  tips: 152,
  streak: 12,
  freezeUsed: false,
  rank: 1,
  shareText: '☕ Nuit #24 🍺98 🧚100 👻71 ⛵88 🧙94 = 451 · 🔥12',
};

function fakePoster(fail = false): CommentPoster & { calls: () => number; texts: () => string[] } {
  let calls = 0;
  const texts: string[] = [];
  return {
    calls: () => calls,
    texts: () => texts,
    submitPlayerComment: async (input) => {
      calls += 1;
      if (fail) throw new Error('reddit is down');
      texts.push(input.text);
      return { commentUrl: `https://www.reddit.com/r/test/comments/post/x/${input.postId}/` };
    },
  };
}

describe('share', () => {
  test('sharing requires a finished night', async () => {
    const store = new MemoryStore();
    const poster = fakePoster();
    const outcome = await shareNight(store, poster, '2026-11-24', 'nassime', 't3_post');
    assert.equal(outcome.ok, false);
    assert.equal(poster.calls(), 0);
  });

  test('first share posts the stored shareText, second replays the URL', async () => {
    const store = new MemoryStore();
    await store.set(nightKey('2026-11-24', 'nassime'), JSON.stringify(SUMMARY));
    const poster = fakePoster();
    const first = await shareNight(store, poster, '2026-11-24', 'nassime', 't3_post');
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.replayed, false);
    assert.ok(first.commentUrl.includes('reddit.com'));
    assert.deepEqual(poster.texts(), [SUMMARY.shareText]);
    const second = await shareNight(store, poster, '2026-11-24', 'nassime', 't3_post');
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.replayed, true);
    assert.equal(second.commentUrl, first.commentUrl);
    assert.equal(poster.calls(), 1);
  });

  test('poster failures surface as errors and store nothing', async () => {
    const store = new MemoryStore();
    await store.set(nightKey('2026-11-24', 'nassime'), JSON.stringify(SUMMARY));
    const outcome = await shareNight(store, fakePoster(true), '2026-11-24', 'nassime', 't3_post');
    assert.equal(outcome.ok, false);
    const retry = await shareNight(store, fakePoster(), '2026-11-24', 'nassime', 't3_post');
    assert.equal(retry.ok, true);
    if (retry.ok) assert.equal(retry.replayed, false);
  });
});

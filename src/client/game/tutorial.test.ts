// src/client/game/tutorial.test.ts — P1
// The tutorial's animation timeline and "only the first time" memory (no browser needed).

/// <reference types="node" />

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LOOP_SECONDS, TUTORIAL_SEEN_KEY, handPose, hasSeenTutorial, markTutorialSeen } from './tutorial.ts';

test('the hand presses, holds while the ring fills, then lifts', () => {
  const start = handPose(0);
  assert.equal(start.handOpacity, 0); // comes in from nothing
  assert.equal(start.pressed, false);

  const holding = handPose(1.0);
  assert.equal(holding.pressed, true);
  assert.ok(holding.scale < 1); // pushed down
  assert.ok(holding.ring > 0.3 && holding.ring < 0.6); // ring half full

  assert.ok(handPose(1.69).ring > 0.95); // nearly full just before release
  const released = handPose(1.85);
  assert.equal(released.pressed, false);
  assert.ok(released.y < 0); // lifted up

  assert.ok(handPose(2.5).handOpacity < 0.01); // gone during the pause
});

test('the ring only fills up during the hold', () => {
  let previous = -1;
  for (let t = 0.5; t <= 1.7; t += 0.05) {
    const ring = handPose(t).ring;
    assert.ok(ring >= previous);
    previous = ring;
  }
  assert.equal(handPose(0.3).ring, 0);
});

test('the animation loops', () => {
  // Decimals are stored with tiny rounding errors, so compare with a small tolerance.
  const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
  for (const t of [0.2, 0.9, 1.8]) {
    for (const later of [handPose(t + LOOP_SECONDS), handPose(t + 3 * LOOP_SECONDS)]) {
      const now = handPose(t);
      assert.ok(close(later.y, now.y) && close(later.scale, now.scale) && close(later.ring, now.ring));
      assert.equal(later.pressed, now.pressed);
    }
  }
});

test('the tutorial is remembered once seen, and survives a blocked storage', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(hasSeenTutorial(storage), false);
  markTutorialSeen(storage);
  assert.equal(store.get(TUTORIAL_SEEN_KEY), '1');
  assert.equal(hasSeenTutorial(storage), true);

  const blocked = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('SecurityError');
    },
  };
  assert.equal(hasSeenTutorial(blocked), false); // no crash
  assert.doesNotThrow(() => markTutorialSeen(blocked));
  assert.equal(hasSeenTutorial(null), false);
});

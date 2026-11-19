// src/client/game/audio.test.ts — P1
// The parts of the sound and crowd-line code that don't need a browser.

/// <reference types="node" />

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dropPitch, pourPitch } from './audio.ts';
import { beatLabel } from './crowdLine.ts';

test('the pour sound rises in pitch as the glass fills', () => {
  let previous = 0;
  for (let level = 0; level <= 1.0001; level += 0.05) {
    const pitch = pourPitch(level);
    assert.ok(pitch > previous, `level ${level}`);
    previous = pitch;
  }
  assert.equal(pourPitch(0), 380);
  assert.equal(pourPitch(1), 1900);
});

test('the pitch rises faster near the top (like a real glass)', () => {
  const bottomStep = pourPitch(0.2) - pourPitch(0.1);
  const topStep = pourPitch(0.9) - pourPitch(0.8);
  assert.ok(topStep > bottomStep * 2);
});

test('pitches stay in range for out-of-range levels', () => {
  assert.equal(pourPitch(-1), pourPitch(0));
  assert.equal(pourPitch(1.5), pourPitch(1));
  assert.equal(dropPitch(2), dropPitch(1));
  assert.ok(dropPitch(0.9) > dropPitch(0.1));
});

test('crowd label: "82 % battus", with a no-break space and clamped to 0..100', () => {
  assert.equal(beatLabel(82), '82 % battus');
  assert.equal(beatLabel(82.6), '83 % battus');
  assert.equal(beatLabel(-5), '0 % battus');
  assert.equal(beatLabel(140), '100 % battus');
});

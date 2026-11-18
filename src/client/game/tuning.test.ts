// src/client/game/tuning.test.ts — P1
// The player model, and the 30 levels it tuned (01 Task 6.2 / 6.3).

/// <reference types="node" />

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import type { GlassSpec, Level, Twist } from '../../shared/types';
import {
  BEGINNER_SIGMA_MS,
  CASUAL_PLAYER_SIGMA_MS,
  FLOW_MAX,
  FLOW_MIN,
  GOOD_PLAYER_SIGMA_MS,
  expectedScore,
  expectedTotal,
  starThresholds,
  tuneFlow,
} from './tuning.ts';
import { TARGET_BY_LEVEL, buildLocation } from './dev/buildLevels.ts';

const LEVELS_DIR = new URL('../../../levels/', import.meta.url);
const glass = (twist: Twist = 'none', flow = 1, model: GlassSpec['model'] = 'pint', line = 0.7): GlassSpec => ({
  model, line, flow, twist, customer: 'test',
});

// ------------------------------------------------------------------ the model

test('expectedScore is deterministic', () => {
  const g = glass('layers2', 1, 'tankard', 0.78);
  assert.equal(expectedScore(g), expectedScore(g));
});

test('a perfectly precise player scores 100', () => {
  assert.ok(expectedScore(glass(), 0.01) > 99.9);
  assert.ok(expectedScore(glass('layers3', 1, 'pint', 0.84), 0.01) > 99.9);
});

test('good players score more than casual players, who score more than beginners', () => {
  for (const twist of ['none', 'foam', 'layers2', 'hidden_line'] as const) {
    const g = glass(twist);
    const good = expectedScore(g, GOOD_PLAYER_SIGMA_MS);
    const casual = expectedScore(g, CASUAL_PLAYER_SIGMA_MS);
    const beginner = expectedScore(g, BEGINNER_SIGMA_MS);
    assert.ok(good > casual && casual > beginner, `${twist}: ${good} ${casual} ${beginner}`);
  }
});

test('a faster flow is harder; a hidden line is harder than a visible one', () => {
  assert.ok(expectedScore(glass('none', 1.3)) < expectedScore(glass('none', 0.8)));
  assert.ok(expectedScore(glass('hidden_line')) < expectedScore(glass('none')));
});

test('tuneFlow lands near the target and stays in bounds, in steps of 0.05', () => {
  for (const target of [80, 85, 90]) {
    const flow = tuneFlow(glass(), target);
    assert.ok(flow >= FLOW_MIN && flow <= FLOW_MAX);
    assert.equal(Math.round(flow * 20), flow * 20);
    assert.ok(Math.abs(expectedScore(glass('none', flow)) - target) < 2, `target ${target} flow ${flow}`);
  }
});

test('star thresholds go up and follow good / casual / beginner players', () => {
  const glasses = [glass(), glass('ice', 1, 'tankard', 0.8), glass('none', 0.6, 'thimble', 0.6)];
  const [one, two, three] = starThresholds(glasses);
  assert.ok(one < two && two < three && three <= 300);
  assert.ok(three <= expectedTotal(glasses, GOOD_PLAYER_SIGMA_MS)); // reachable by a good player
  assert.ok(one >= 90); // at least 30 per glass
});

// ------------------------------------------------------------------ the 30 levels

const LOCATIONS = ['cafe', 'beach', 'chalet'] as const;

for (const location of LOCATIONS) {
  test(`${location}: 10 levels in /levels, up to date with "npm run levels"`, () => {
    const files = readdirSync(LEVELS_DIR).filter((f) => f.startsWith(`${location}-`) && f.endsWith('.json'));
    assert.equal(files.length, 10);
    for (const level of buildLocation(location)) {
      const onDisk = JSON.parse(readFileSync(new URL(`${level.id}.json`, LEVELS_DIR), 'utf8')) as Level;
      assert.deepEqual(onDisk, level, `${level.id}.json differs: run "npm run levels"`);
    }
  });

  test(`${location}: a good player averages about 85, and difficulty goes up`, () => {
    const levels = buildLocation(location);
    const scores = levels.flatMap((l) => l.glasses.map((g) => expectedScore(g)));
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    assert.ok(average > 83 && average < 87, `average ${average.toFixed(1)}`);
    levels.forEach((level, i) => {
      const levelAvg = expectedTotal(level.glasses) / level.glasses.length;
      assert.ok(Math.abs(levelAvg - TARGET_BY_LEVEL[i]!) < 3, `${level.id}: ${levelAvg.toFixed(1)}`);
      assert.ok(level.glasses.length >= 3 && level.glasses.length <= 5);
    });
    // Short levels first, 5-glass levels at the end (level 4 is short on purpose: first twist).
    assert.ok(levels.slice(0, 3).every((l) => l.glasses.length <= 4));
    assert.ok(levels.slice(7).every((l) => l.glasses.length === 5));
  });
}

test('levels 1-3 have no twist; the hardest twists only appear from level 8', () => {
  const hard: Twist[] = ['layers2', 'layers3', 'foam'];
  for (const location of LOCATIONS) {
    buildLocation(location).forEach((level, i) => {
      const twists = level.glasses.map((g) => g.twist);
      if (i < 3) assert.ok(twists.every((t) => t === 'none'), `${level.id}`);
      if (i < 7 && location !== 'chalet') assert.ok(!twists.some((t) => hard.includes(t)), `${level.id}`);
    });
  }
});

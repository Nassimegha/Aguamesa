// src/client/game/dev/buildLevels.ts — P1 tool (01 Task 6.2 and 6.3).
// Writes the 30 levels of the first 3 locations into /levels, with `flow` and `stars`
// computed by the player model (tuning.ts) so a good player averages ~85.
//
// Run:  npm run levels
// Edit the DESIGN tables below (glass, line, twist, customer), then run it again:
// it never invents the level layout, it only tunes the speed and the star thresholds.

/// <reference types="node" />
/* global process: readonly */

import { writeFileSync } from 'node:fs';
import type { GlassModel, GlassSpec, Level, LocationId, Twist } from '../../../shared/types';
import { GOOD_PLAYER_SIGMA_MS, expectedScore, starThresholds, tuneFlow } from '../tuning.ts';

type GlassDesign = [model: GlassModel, line: number, twist: Twist, customer: string];

/**
 * Difficulty curve inside a location: what a good player should score on average on each
 * glass. Levels 1-3 warm up (90), 4-7 are the core (85), 8-10 push harder (82).
 * Overall average ≈ 85 (01 Task 6.2).
 */
export const TARGET_BY_LEVEL = [90, 90, 90, 85, 85, 85, 85, 82, 82, 82] as const;

// Customers per location (P2's char_<id>.glb).
const C = { giant: 'giant', fairy: 'fairy', ghost: 'ghost' };
const B = { surfer: 'surfer', crab: 'crab_mister', mermaid: 'mermaid' };
const H = { yeti: 'yeti', skier: 'skier', bear: 'grandma_bear' };

/** 10 levels per location: 3 glasses at first, 4 in the middle, 5 at the end; twists ramp up. */
export const DESIGN: Record<'cafe' | 'beach' | 'chalet', GlassDesign[][]> = {
  cafe: [
    [['pint', 0.7, 'none', C.giant], ['pint', 0.55, 'none', C.fairy], ['tankard', 0.75, 'none', C.ghost]],
    [['mug_giant', 0.78, 'none', C.giant], ['thimble', 0.6, 'none', C.fairy], ['pint', 0.65, 'none', C.ghost]],
    [['teacup', 0.65, 'none', C.fairy], ['pint', 0.8, 'none', C.giant], ['goblet', 0.7, 'none', C.ghost], ['tankard', 0.6, 'none', C.giant]],
    [['pint', 0.72, 'none', C.giant], ['goblet', 0.66, 'spin', C.ghost], ['teacup', 0.7, 'none', C.fairy]],
    [['tankard', 0.8, 'ice', C.giant], ['pint', 0.6, 'none', C.fairy], ['goblet', 0.72, 'ice', C.ghost], ['mug_giant', 0.68, 'none', C.giant]],
    [['teacup', 0.72, 'steam', C.fairy], ['pint', 0.78, 'none', C.giant], ['mug_giant', 0.82, 'steam', C.giant], ['thimble', 0.55, 'none', C.fairy]],
    [['pint', 0.66, 'hidden_line', C.ghost], ['tankard', 0.74, 'leak', C.giant], ['flute', 0.62, 'none', C.fairy], ['goblet', 0.7, 'spin', C.ghost]],
    [['pint', 0.75, 'foam', C.giant], ['tankard', 0.7, 'foam', C.ghost], ['teacup', 0.68, 'steam', C.fairy], ['mug_giant', 0.72, 'foam', C.giant], ['thimble', 0.6, 'none', C.fairy]],
    [['pint', 0.8, 'layers2', C.giant], ['flute', 0.7, 'none', C.fairy], ['tankard', 0.78, 'layers2', C.ghost], ['goblet', 0.64, 'hidden_line', C.ghost], ['pint', 0.72, 'ice', C.giant]],
    [['mug_giant', 0.84, 'layers3', C.giant], ['thimble', 0.62, 'hidden_line', C.fairy], ['pint', 0.74, 'foam', C.giant], ['teacup', 0.75, 'steam', C.fairy], ['tankard', 0.82, 'layers2', C.ghost]],
  ],
  beach: [
    [['coconut', 0.7, 'none', B.surfer], ['flute', 0.6, 'none', B.mermaid], ['pint', 0.72, 'none', B.crab]],
    [['coconut', 0.62, 'none', B.crab], ['thimble', 0.6, 'none', B.mermaid], ['goblet', 0.75, 'none', B.surfer]],
    [['flute', 0.68, 'none', B.mermaid], ['coconut', 0.78, 'none', B.surfer], ['pint', 0.6, 'none', B.crab], ['goblet', 0.66, 'none', B.mermaid]],
    [['coconut', 0.7, 'ice', B.surfer], ['flute', 0.65, 'none', B.mermaid], ['pint', 0.74, 'ice', B.crab]],
    [['goblet', 0.7, 'tilt', B.crab], ['coconut', 0.66, 'none', B.surfer], ['flute', 0.62, 'tilt', B.mermaid], ['pint', 0.8, 'none', B.crab]],
    [['coconut', 0.72, 'spin', B.surfer], ['goblet', 0.68, 'ice', B.mermaid], ['flute', 0.7, 'none', B.mermaid], ['tankard', 0.76, 'tilt', B.crab]],
    [['pint', 0.7, 'leak', B.crab], ['coconut', 0.64, 'hidden_line', B.surfer], ['flute', 0.66, 'ice', B.mermaid], ['goblet', 0.74, 'none', B.crab]],
    [['flute', 0.75, 'layers2', B.mermaid], ['coconut', 0.7, 'ice', B.surfer], ['goblet', 0.72, 'tilt', B.crab], ['pint', 0.68, 'spin', B.crab], ['thimble', 0.58, 'none', B.mermaid]],
    [['coconut', 0.78, 'layers2', B.surfer], ['flute', 0.62, 'hidden_line', B.mermaid], ['pint', 0.76, 'foam', B.crab], ['goblet', 0.7, 'leak', B.crab], ['coconut', 0.68, 'tilt', B.surfer]],
    [['flute', 0.82, 'layers3', B.mermaid], ['coconut', 0.72, 'tilt', B.surfer], ['goblet', 0.66, 'hidden_line', B.crab], ['pint', 0.8, 'layers2', B.crab], ['thimble', 0.62, 'ice', B.mermaid]],
  ],
  chalet: [
    [['mug_giant', 0.72, 'none', H.yeti], ['teacup', 0.6, 'none', H.bear], ['tankard', 0.7, 'none', H.skier]],
    [['teacup', 0.68, 'none', H.bear], ['mug_giant', 0.82, 'none', H.yeti], ['thimble', 0.58, 'none', H.skier]],
    [['tankard', 0.76, 'none', H.skier], ['teacup', 0.62, 'none', H.bear], ['mug_giant', 0.66, 'none', H.yeti], ['goblet', 0.72, 'none', H.bear]],
    [['teacup', 0.7, 'steam', H.bear], ['tankard', 0.66, 'none', H.skier], ['mug_giant', 0.78, 'steam', H.yeti]],
    [['mug_giant', 0.7, 'foam', H.yeti], ['teacup', 0.64, 'none', H.bear], ['tankard', 0.74, 'foam', H.skier], ['goblet', 0.68, 'none', H.bear]],
    [['goblet', 0.72, 'ice', H.skier], ['teacup', 0.7, 'steam', H.bear], ['mug_giant', 0.8, 'none', H.yeti], ['tankard', 0.66, 'leak', H.skier]],
    [['teacup', 0.66, 'hidden_line', H.bear], ['mug_giant', 0.74, 'steam', H.yeti], ['tankard', 0.7, 'ice', H.skier], ['goblet', 0.64, 'spin', H.bear]],
    [['mug_giant', 0.76, 'foam', H.yeti], ['teacup', 0.72, 'steam', H.bear], ['tankard', 0.8, 'layers2', H.skier], ['goblet', 0.7, 'leak', H.bear], ['thimble', 0.6, 'none', H.skier]],
    [['mug_giant', 0.82, 'layers2', H.yeti], ['teacup', 0.68, 'hidden_line', H.bear], ['tankard', 0.72, 'foam', H.skier], ['goblet', 0.74, 'steam', H.bear], ['pint', 0.7, 'ice', H.skier]],
    [['mug_giant', 0.86, 'layers3', H.yeti], ['teacup', 0.74, 'steam', H.bear], ['tankard', 0.78, 'foam', H.skier], ['thimble', 0.6, 'hidden_line', H.skier], ['goblet', 0.8, 'layers2', H.bear]],
  ],
};

/** Builds one location's 10 tuned levels (pure: used by the CLI below and by the tests). */
export function buildLocation(location: 'cafe' | 'beach' | 'chalet'): Level[] {
  return DESIGN[location].map((designs, i) => {
    const target = TARGET_BY_LEVEL[i]!;
    const glasses: GlassSpec[] = designs.map(([model, line, twist, customer]) => {
      const base: GlassSpec = { model, line, flow: 1, twist, customer };
      return { ...base, flow: tuneFlow(base, target) };
    });
    return {
      id: `${location}-${String(i + 1).padStart(2, '0')}`,
      location: location as LocationId,
      glasses,
      stars: starThresholds(glasses),
    };
  });
}

/** Same layout as the hand-written files: one glass per line, easy to read in a diff. */
export function levelToJson(level: Level): string {
  const glasses = level.glasses.map((g) => `    ${JSON.stringify(g).replace(/,"/g, ', "').replace(/":/g, '": ')}`);
  return [
    '{',
    `  "id": "${level.id}",`,
    `  "location": "${level.location}",`,
    '  "glasses": [',
    glasses.join(',\n'),
    '  ],',
    `  "stars": [${level.stars.join(', ')}]`,
    '}',
    '',
  ].join('\n');
}

// --- CLI ---------------------------------------------------------------------------------
// Only when run as a script (npm run levels), not when imported by the tests.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/dev/buildLevels.ts')) {
  const dir = new URL('../../../../levels/', import.meta.url);
  for (const location of ['cafe', 'beach', 'chalet'] as const) {
    let sum = 0;
    let count = 0;
    for (const level of buildLocation(location)) {
      writeFileSync(new URL(`${level.id}.json`, dir), levelToJson(level));
      const scores = level.glasses.map((g) => expectedScore(g, GOOD_PLAYER_SIGMA_MS));
      sum += scores.reduce((a, b) => a + b, 0);
      count += scores.length;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const flows = level.glasses.map((g) => g.flow.toFixed(2)).join(' ');
      console.log(`${level.id}  good-player avg ${avg.toFixed(1)}  stars ${level.stars.join('/')}  flows ${flows}`);
    }
    console.log(`${location}: average over 10 levels ${(sum / count).toFixed(1)}\n`);
  }
}

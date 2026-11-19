// src/server/levels.ts — P3 (Task 2)
// Levels-mode star thresholds. The Level files themselves are P1's
// (levels/*.json, §6.1 Level); when they land, import them here and add
// them to LEVELS. Until then the registry is empty and /api/level/complete
// answers 404 with a message that says so.
//
// No formula is invented: stars come straight from the level's
// `stars: [1-star total, 2-star total, 3-star total]` thresholds.
import type { Level } from '../shared/types';

/** Known levels by id. Empty until P1 delivers levels/*.json. */
const LEVELS: Record<string, Level> = {};

export function getLevel(levelId: string): Level | undefined {
  return LEVELS[levelId];
}

/** 0..3 stars for a total, from the level's own thresholds. */
export function starsForTotal(level: Level, total: number): number {
  const [one, two, three] = level.stars;
  if (total >= three) return 3;
  if (total >= two) return 2;
  if (total >= one) return 1;
  return 0;
}

// src/server/crowd.ts — P3 (Task 4)
// The crowd line (where the others stopped on average) and beatPercent
// (share of players who did worse). Pure helpers over the per-glass
// stats that score.ts maintains; score.ts calls these so the rule lives
// in exactly one place.
//
// Seeding rule (brief T4.2): with fewer than 5 other pours, there is no
// crowd yet — crowdLine defaults to the glass's own line and beatPercent
// to 50. (The brief says "fixée dans le contenu", but DailyService has
// no such field and §6 is frozen; these seeds are the P3 default.)
export const CROWD_MIN_PLAYERS = 5;
export const SEEDED_BEAT_PERCENT = 50;

/** Mean other-players level in 0..1, or the glass line while unseeded. */
export function crowdLineFromStats(
  sumMilli: number,
  count: number,
  seedLine: number,
  minPlayers: number = CROWD_MIN_PLAYERS
): number {
  if (count >= minPlayers && count > 0) return sumMilli / count / 1000;
  return seedLine;
}

/** 0..100 share of other scores strictly below mine, seeded while small. */
export function beatPercentFromScores(
  otherScores: number[],
  myScore: number,
  minPlayers: number = CROWD_MIN_PLAYERS
): number {
  if (otherScores.length < minPlayers) return SEEDED_BEAT_PERCENT;
  const worse = otherScores.filter((score) => score < myScore).length;
  return Math.round((100 * worse) / otherScores.length);
}

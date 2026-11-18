// src/client/game/dev/mockServer.ts — P1, local test bench only.
// A fake server that behaves like the real one should (00 §6.2), for testing a night
// with `npm run dev:local`:
//   - scores with the SAME pour.ts as the real server (not a fixed 97 like the skeleton mock);
//   - refuses a glass already played today (one try per day);
//   - answers after a small fake network delay.
// crowdLine / beatPercent are invented but deterministic until P3 has real ones.

import type { DailyService, NightSummary, PlayerState, PourRequest, PourResult } from '../../../shared/types';
import { pour } from '../../../shared/pour';
import type { NightApi } from '../round';
import { starsFor, type LevelApi } from '../levelPlayer';
import { loadLevel } from '../levels';

/** §10.1 example night. Twists are set to "none" until Task 4 implements them. */
export const MOCK_TODAY: DailyService = {
  dayId: '2026-11-24',
  night: 24,
  location: 'cafe',
  glasses: [
    { model: 'mug_giant', line: 0.78, flow: 1.0, twist: 'none', customer: 'giant' },
    { model: 'thimble', line: 0.6, flow: 0.6, twist: 'none', customer: 'fairy' },
    { model: 'goblet', line: 0.7, flow: 1.0, twist: 'none', customer: 'ghost' },
    { model: 'tankard', line: 0.82, flow: 1.1, twist: 'none', customer: 'giant' },
    { model: 'flute', line: 0.65, flow: 0.9, twist: 'none', customer: 'fairy' },
  ],
};

const EMOJI: Record<string, string> = { giant: '🍺', fairy: '🧚', ghost: '👻' };
const FAKE_LATENCY_MS = 250;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createMockServer(today: DailyService = MOCK_TODAY): NightApi & LevelApi {
  const scores: (number | null)[] = today.glasses.map(() => null);
  const player: PlayerState = {
    username: 'marwa', serverLevel: 1, streak: 4, bestStreak: 4, streakFreezes: 0,
    lastPlayedDayId: '2026-11-23', tips: 0, stars: {}, collection: ['pint'], decor: [],
    playedToday: today.glasses.map(() => false),
  };

  return {
    async pour(request: PourRequest): Promise<PourResult> {
      await sleep(FAKE_LATENCY_MS);
      const spec = today.glasses[request.glassIndex];
      if (!spec || request.dayId !== today.dayId) throw new Error('400 bad request');
      if (scores[request.glassIndex] !== null) throw new Error('409 glass already played today');
      const result = pour(spec, request.holdMs);
      scores[request.glassIndex] = result.score;
      player.playedToday[request.glassIndex] = true;
      // Pretend the crowd stops a bit below the line, and beat% follows the score.
      return { ...result, crowdLine: Math.max(0, spec.line - 0.04), beatPercent: Math.round(result.score * 0.9) };
    },

    async finishNight(dayId: string): Promise<NightSummary> {
      await sleep(FAKE_LATENCY_MS);
      if (scores.some((s) => s === null)) throw new Error('409 night not finished');
      const final = scores as number[];
      const total = final.reduce((a, b) => a + b, 0);
      const parts = today.glasses.map((g, i) => `${EMOJI[g.customer] ?? '🥤'}${final[i]}`).join(' ');
      return {
        dayId, scores: final, total, tips: Math.round(total / 10), streak: player.streak + 1,
        freezeUsed: false, rank: 7,
        shareText: `☕ Nuit #${today.night} ${parts} = ${total} · 🔥${player.streak + 1}`,
      };
    },

    async completeLevel(levelId: string, levelScores: number[]) {
      await sleep(FAKE_LATENCY_MS);
      const level = await loadLevel(levelId);
      const total = levelScores.reduce((a, b) => a + b, 0);
      const stars = starsFor(level, total);
      player.stars[levelId] = Math.max(player.stars[levelId] ?? 0, stars);
      return { stars, player: { ...player } };
    },
  };
}

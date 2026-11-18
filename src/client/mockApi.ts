// src/client/mockApi.ts — P3 (Task 1 skeleton)
// Fake /api for `npm run dev:local` (Vite, no Reddit server).
// Implements the SAME GameApi interface as src/client/api.ts, so P1/P2
// code can swap api <-> mockApi without changing call sites.
//
// What is verbatim from the contract, and what is a stub:
// - GET /api/init and POST /api/pour: payloads are VERBATIM from
//   00 §10.1 and §10.2. The pour result is always that §10.2 example
//   (score 97, level 0.775), whatever holdMs you pass — Task 1 does NOT
//   score. Real scoring is Task 2, server-side, with P1's pour.ts.
// - The other 5 endpoints have NO example payload in §10. Their values
//   below are DERIVED Task 1 stubs, kept consistent with the §10 data
//   (same dayId 2026-11-24, night #24, streak 12, and the shareText
//   example from §6.1 / §2). They are placeholders, not contract data.
//   In particular `tips` in the night summary, the leaderboard rows,
//   and the share commentUrl are invented stub values.
//
// No randomness, no Date.now(): the same call always returns the same
// data, so P1/P2 can develop against it deterministically.

import type {
  DailyService,
  LeaderboardRow,
  NightSummary,
  PlayerState,
  PourRequest,
  PourResult,
} from '../shared/types';
import type {
  GameApi,
  InitResponse,
  LevelCompleteResponse,
  ShareResponse,
} from './api';

/** §10.1 — verbatim. */
export const mockPlayer: PlayerState = {
  username: 'nassime',
  serverLevel: 12,
  streak: 12,
  bestStreak: 15,
  streakFreezes: 1,
  lastPlayedDayId: '2026-11-23',
  tips: 340,
  stars: { 'cafe-01': 3, 'cafe-02': 2 },
  collection: ['pint', 'thimble'],
  decor: ['lamp_warm'],
  playedToday: [false, false, false, false, false],
};

/** §10.1 — verbatim. */
export const mockToday: DailyService = {
  dayId: '2026-11-24',
  night: 24,
  location: 'cafe',
  glasses: [
    { model: 'mug_giant', line: 0.78, flow: 1.0, twist: 'none', customer: 'giant' },
    { model: 'thimble', line: 0.6, flow: 0.6, twist: 'none', customer: 'fairy' },
    { model: 'goblet', line: 0.7, flow: 1.0, twist: 'steam', customer: 'ghost' },
    { model: 'tankard', line: 0.82, flow: 1.1, twist: 'tilt', customer: 'pirate' },
    { model: 'flute', line: 0.65, flow: 0.9, twist: 'layers2', customer: 'wizard' },
  ],
};

/** §10.2 — verbatim (the example request was dayId 2026-11-24, glassIndex 0, holdMs 1840). */
export const mockPourResult: PourResult = {
  score: 97,
  level: 0.775,
  overflow: false,
  crowdLine: 0.71,
  beatPercent: 82,
};

/**
 * DERIVED stub (no §10 example exists for /api/night/finish).
 * Scores/total/shareText match the §6.1 shareText example:
 * "☕ Nuit #24 🍺98 🧚100 👻71 ⛵88 🧙94 = 451 · 🔥12".
 * `tips` (135) and `rank` (3) are stub values.
 */
export const mockNightSummary: NightSummary = {
  dayId: '2026-11-24',
  scores: [98, 100, 71, 88, 94],
  total: 451,
  tips: 135,
  streak: 12,
  freezeUsed: false,
  rank: 3,
  shareText: '☕ Nuit #24 🍺98 🧚100 👻71 ⛵88 🧙94 = 451 · 🔥12',
};

/** DERIVED stub (no §10 example exists for /api/leaderboard). */
export const mockLeaderboard: LeaderboardRow[] = [
  { rank: 1, username: 'nassime', total: 451, streak: 12 },
  { rank: 2, username: 'marwa', total: 432, streak: 9 },
  { rank: 3, username: 'mohamed', total: 418, streak: 12 },
];

/** DERIVED stub (no §10 example exists for /api/share). No comment is really posted. */
export const mockShareResponse: ShareResponse = {
  commentUrl: 'https://www.reddit.com/r/aguamesa_dev/comments/mock-night-24/',
};

// A mutable copy, so local dev can see playedToday change after a pour.
// The real server (Task 2, Redis) owns this state for real; here it is
// only in-memory, in this page, and resets on reload.
const playerState: PlayerState = {
  ...mockPlayer,
  stars: { ...mockPlayer.stars },
  collection: [...mockPlayer.collection],
  decor: [...mockPlayer.decor],
  playedToday: [...mockPlayer.playedToday],
};

export const mockApi: GameApi = {
  init: async (): Promise<InitResponse> => ({
    player: { ...playerState, playedToday: [...playerState.playedToday] },
    today: mockToday,
  }),

  pour: async (request: PourRequest): Promise<PourResult> => {
    // Stub: always the §10.2 example. Mark the glass played locally so
    // the UI can show it; the server-side one-try rule is Task 2.
    const played = playerState.playedToday[request.glassIndex];
    if (played !== undefined) {
      playerState.playedToday[request.glassIndex] = true;
    }
    void request; // holdMs is ignored in Task 1 — see header comment.
    return { ...mockPourResult };
  },

  finishNight: async (dayId: string): Promise<NightSummary> => ({
    ...mockNightSummary,
    dayId,
  }),

  share: async (): Promise<ShareResponse> => ({ ...mockShareResponse }),

  leaderboard: async (): Promise<LeaderboardRow[]> =>
    mockLeaderboard.map((row) => ({ ...row })),

  completeLevel: async (
    levelId: string,
    scores: number[],
  ): Promise<LevelCompleteResponse> => {
    // Stub: fixed 2 stars. The real thresholds live in each Level's
    // `stars: [1-star total, 2-star total, 3-star total]` (P1, levels/*.json)
    // and the real server will apply them in Task 2. No formula is invented here.
    void scores;
    const stars = 2;
    playerState.stars[levelId] = stars;
    return {
      stars,
      player: { ...playerState, stars: { ...playerState.stars } },
    };
  },

  buyDecor: async (item: string): Promise<PlayerState> => {
    if (!playerState.decor.includes(item)) {
      playerState.decor.push(item);
    }
    return { ...playerState, decor: [...playerState.decor] };
  },
};

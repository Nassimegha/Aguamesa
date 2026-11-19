// src/server/routes/api.ts — P3 (Task 1 skeleton)
// MERGED version: this REPLACES the template's counter router.
// Template mounted this router at /api in src/server/index.ts
// (app.route('/api', api)), so routes here are '/init', '/pour', etc.
// — NOT '/api/init'. Do not add the /api prefix here.
//
// All 7 endpoints from contract 00 §6.2, STUBBED: each returns the
// §10 example payload (or, where §10 has no example, a derived stub
// consistent with it). No Redis, no real scoring, no Reddit posting yet.
// That is Task 2 (score) and Task 4 (share/flair).
// Types live in src/shared/types.ts (verbatim §6.1).

import { Hono } from 'hono';
import type {
  DailyService,
  LeaderboardRow,
  NightSummary,
  PlayerState,
  PourRequest,
  PourResult,
} from '../../shared/types';

export const api = new Hono();

/** §10.1 — verbatim. */
const mockPlayer: PlayerState = {
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
const mockToday: DailyService = {
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

/** §10.2 — verbatim. */
const mockPourResult: PourResult = {
  score: 97,
  level: 0.775,
  overflow: false,
  crowdLine: 0.71,
  beatPercent: 82,
};

/** DERIVED stub — no §10 example for /night/finish. tips/rank are stub values. */
const mockNightSummary: NightSummary = {
  dayId: '2026-11-24',
  scores: [98, 100, 71, 88, 94],
  total: 451,
  tips: 135,
  streak: 12,
  freezeUsed: false,
  rank: 3,
  shareText: '☕ Nuit #24 🍺98 🧚100 👻71 ⛵88 🧙94 = 451 · 🔥12',
};

/** DERIVED stub — no §10 example for /leaderboard. */
const mockLeaderboard: LeaderboardRow[] = [
  { rank: 1, username: 'nassime', total: 451, streak: 12 },
  { rank: 2, username: 'marwa', total: 432, streak: 9 },
  { rank: 3, username: 'mohamed', total: 418, streak: 12 },
];

/** GET /init — mounted as /api/init. Returns §10.1 verbatim. */
api.get('/init', (c) => {
  return c.json({ player: mockPlayer, today: mockToday });
});

/** POST /pour — stub: always returns §10.2, whatever holdMs is sent. */
api.post('/pour', async (c) => {
  const body = (await c.req.json().catch(() => null)) as PourRequest | null;
  if (body === null || typeof body.glassIndex !== 'number') {
    return c.json({ error: 'Expected a PourRequest: { dayId, glassIndex, holdMs }' }, 400);
  }
  void body;
  return c.json(mockPourResult);
});

/** POST /night/finish — stub, derived mockNightSummary. */
api.post('/night/finish', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { dayId?: string } | null;
  if (body === null || typeof body.dayId !== 'string') {
    return c.json({ error: 'Expected { dayId }' }, 400);
  }
  return c.json({ ...mockNightSummary, dayId: body.dayId });
});

/** POST /share — stub: fake commentUrl, NO comment is really posted. */
api.post('/share', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { dayId?: string } | null;
  if (body === null || typeof body.dayId !== 'string') {
    return c.json({ error: 'Expected { dayId }' }, 400);
  }
  return c.json({
    commentUrl: 'https://www.reddit.com/r/aguamesa_dev/comments/mock-night-24/',
  });
});

/** GET /leaderboard?scope=day|all — stub, same rows for both scopes. */
api.get('/leaderboard', (c) => {
  const scope = c.req.query('scope');
  if (scope !== undefined && scope !== 'day' && scope !== 'all') {
    return c.json({ error: 'Expected scope=day or scope=all' }, 400);
  }
  void scope;
  return c.json(mockLeaderboard);
});

/** POST /level/complete — stub: fixed 2 stars. */
api.post('/level/complete', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    levelId?: string;
    scores?: number[];
  } | null;
  if (body === null || typeof body.levelId !== 'string' || !Array.isArray(body.scores)) {
    return c.json({ error: 'Expected { levelId, scores: number[] }' }, 400);
  }
  return c.json({
    stars: 2,
    player: { ...mockPlayer, stars: { ...mockPlayer.stars, [body.levelId]: 2 } },
  });
});

/** POST /decor/buy — stub: returns mock player with item added, no tips deducted. */
api.post('/decor/buy', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { item?: string } | null;
  if (body === null || typeof body.item !== 'string') {
    return c.json({ error: 'Expected { item }' }, 400);
  }
  const decor = mockPlayer.decor.includes(body.item)
    ? mockPlayer.decor
    : [...mockPlayer.decor, body.item];
  return c.json({ ...mockPlayer, decor });
});

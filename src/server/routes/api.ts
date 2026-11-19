// src/server/routes/api.ts — P3 (Task 2: real /init, /pour, /level/complete)
// MERGED version: this REPLACES the template's counter router.
// Template mounts this router at /api in src/server/index.ts
// (app.route('/api', api)), so routes here are '/init', '/pour', etc.
// — NOT '/api/init'. Do not add the /api prefix here.
//
// Task 1 stubbed all 7 endpoints from contract 00 §6.2. Task 2 makes
// three of them real (Redis + server score); the other four keep their
// Task 1 stubs until Task 3 (/night/finish) and Task 4 (/share,
// /leaderboard). /decor/buy stays stubbed: prices are not in the
// contract, and decor is first on the cut list (§12).
// Types live in src/shared/types.ts (verbatim §6.1).
import { Hono } from 'hono';
import type { Context as HonoContext } from 'hono';
import { context, redis } from '@devvit/web/server';
import type { LeaderboardRow, NightSummary } from '../../shared/types';
import { resolvePostDay } from '../content';
import { getLevel, starsForTotal } from '../levels';
import { getPlayedToday, loadOrCreatePlayer, savePlayer } from '../player';
import type { Store } from '../redis';
import { pourGlass } from '../score';

// Devvit's client satisfies Store structurally; this line fails the type
// check if the two ever drift apart.
const store: Store = redis;

export const api = new Hono();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readBody(c: HonoContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function loggedInUser(): string | undefined {
  return context.username;
}

/** DERIVED stub — no §10 example for /night/finish. Real in Task 3. */
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

/** DERIVED stub — no §10 example for /leaderboard. Real in Task 4. */
const mockLeaderboard: LeaderboardRow[] = [
  { rank: 1, username: 'nassime', total: 451, streak: 12 },
  { rank: 2, username: 'marwa', total: 432, streak: 9 },
  { rank: 3, username: 'mohamed', total: 418, streak: 12 },
];

/** GET /init — real: profile from Redis, day from the post. */
api.get('/init', async (c) => {
  const username = loggedInUser();
  if (username === undefined) {
    return c.json({ error: 'Login required' }, 401);
  }
  const day = resolvePostDay(context.postData);
  const player = await loadOrCreatePlayer(store, username);
  const playedToday = await getPlayedToday(store, day.dayId, username, day.glasses.length);
  return c.json({ player: { ...player, playedToday }, today: day });
});

/** POST /pour — real: server score, one try per glass (replay = stored). */
api.post('/pour', async (c) => {
  const username = loggedInUser();
  if (username === undefined) {
    return c.json({ error: 'Login required' }, 401);
  }
  const body = await readBody(c);
  if (!isRecord(body)) {
    return c.json({ error: 'Expected a PourRequest: { dayId, glassIndex, holdMs }' }, 400);
  }
  const { dayId, glassIndex, holdMs } = body;
  if (typeof dayId !== 'string' || typeof glassIndex !== 'number' || typeof holdMs !== 'number') {
    return c.json({ error: 'Expected a PourRequest: { dayId, glassIndex, holdMs }' }, 400);
  }
  const day = resolvePostDay(context.postData);
  const outcome = await pourGlass(store, day, { username, dayId, glassIndex, holdMs });
  if (!outcome.ok) {
    return c.json({ error: outcome.error }, 400);
  }
  return c.json(outcome.result);
});

/** POST /night/finish — stub until Task 3. */
api.post('/night/finish', async (c) => {
  const body = await readBody(c);
  if (!isRecord(body) || typeof body['dayId'] !== 'string') {
    return c.json({ error: 'Expected { dayId }' }, 400);
  }
  return c.json({ ...mockNightSummary, dayId: body['dayId'] });
});

/** POST /share — stub until Task 4: fake commentUrl, nothing is posted. */
api.post('/share', async (c) => {
  const body = await readBody(c);
  if (!isRecord(body) || typeof body['dayId'] !== 'string') {
    return c.json({ error: 'Expected { dayId }' }, 400);
  }
  return c.json({
    commentUrl: 'https://www.reddit.com/r/aguamesa_dev/comments/mock-night-24/',
  });
});

/** GET /leaderboard?scope=day|all — stub until Task 4. */
api.get('/leaderboard', (c) => {
  const scope = c.req.query('scope');
  if (scope !== undefined && scope !== 'day' && scope !== 'all') {
    return c.json({ error: 'Expected scope=day or scope=all' }, 400);
  }
  return c.json(mockLeaderboard);
});

/**
 * POST /level/complete — real thresholds, empty registry: P1's
 * levels/*.json are not delivered yet, so every levelId 404s until then.
 * No star formula is invented; thresholds come from each Level.
 */
api.post('/level/complete', async (c) => {
  const username = loggedInUser();
  if (username === undefined) {
    return c.json({ error: 'Login required' }, 401);
  }
  const body = await readBody(c);
  if (!isRecord(body)) {
    return c.json({ error: 'Expected { levelId, scores: number[] }' }, 400);
  }
  const { levelId, scores } = body;
  if (
    typeof levelId !== 'string' ||
    !Array.isArray(scores) ||
    !scores.every((s): s is number => typeof s === 'number')
  ) {
    return c.json({ error: 'Expected { levelId, scores: number[] }' }, 400);
  }
  const level = getLevel(levelId);
  if (level === undefined) {
    return c.json({ error: `Unknown level ${levelId}: P1's levels/*.json are not delivered yet` }, 404);
  }
  const total = scores.reduce((sum, s) => sum + s, 0);
  const stars = starsForTotal(level, total);
  const player = await loadOrCreatePlayer(store, username);
  const best = Math.max(player.stars[levelId] ?? 0, stars);
  const updated = { ...player, stars: { ...player.stars, [levelId]: best } };
  await savePlayer(store, updated);
  return c.json({ stars, player: updated });
});

/** POST /decor/buy — persisted, but free: decor prices are not in the contract (§12 cut list). */
api.post('/decor/buy', async (c) => {
  const username = loggedInUser();
  if (username === undefined) {
    return c.json({ error: 'Login required' }, 401);
  }
  const body = await readBody(c);
  if (!isRecord(body) || typeof body['item'] !== 'string') {
    return c.json({ error: 'Expected { item }' }, 400);
  }
  const player = await loadOrCreatePlayer(store, username);
  if (!player.decor.includes(body['item'])) {
    const updated = { ...player, decor: [...player.decor, body['item']] };
    await savePlayer(store, updated);
    return c.json(updated);
  }
  return c.json(player);
});

// src/server/routes/api.ts — P3 (Task 2: real /init, /pour, /level/complete)
// MERGED version: this REPLACES the template's counter router.
// Template mounts this router at /api in src/server/index.ts
// (app.route('/api', api)), so routes here are '/init', '/pour', etc.
// — NOT '/api/init'. Do not add the /api prefix here.
//
// Task 1 stubbed all 7 endpoints from contract 00 §6.2; Tasks 2-4 made
// them real (Redis, server score, streaks, leaderboards, share, flair).
// /decor/buy persists but is free: prices are not in the contract, and
// decor is first on the cut list (§12).
// Types live in src/shared/types.ts (verbatim §6.1).
import { Hono } from 'hono';
import type { Context as HonoContext } from 'hono';
import { context, redis } from '@devvit/web/server';
import { resolvePostDay } from '../content';
import { refreshFlair } from '../flair';
import { getLeaderboard, type BoardScope } from '../leaderboard';
import { finishNight } from '../night';
import { shareNight } from '../share';
import { createCommentPoster, createFlairSetter } from '../social';
import { getLevel, starsForTotal } from '../levels';
import { getPlayedToday, loadOrCreatePlayer, savePlayer } from '../player';
import type { Store } from '../redis';
import { pourGlass } from '../score';

// Devvit's client satisfies Store structurally; this line fails the type
// check if the two ever drift apart.
const store: Store = redis;
const commentPoster = createCommentPoster();
const flairSetter = createFlairSetter();

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

/** POST /night/finish — real: totals, tips, streak, rank, shareText. */
api.post('/night/finish', async (c) => {
  const username = loggedInUser();
  if (username === undefined) {
    return c.json({ error: 'Login required' }, 401);
  }
  const body = await readBody(c);
  if (!isRecord(body) || typeof body['dayId'] !== 'string') {
    return c.json({ error: 'Expected { dayId }' }, 400);
  }
  const day = resolvePostDay(context.postData);
  if (body['dayId'] !== day.dayId) {
    return c.json({ error: `Stale day: post plays ${day.dayId}` }, 400);
  }
  const player = await loadOrCreatePlayer(store, username);
  const outcome = await finishNight(store, day, username, player);
  if (!outcome.ok) {
    return c.json({ error: outcome.error }, 400);
  }
  // Flair is best-effort: it must never fail a finished night.
  const fresh = await loadOrCreatePlayer(store, username);
  const flair = await refreshFlair(flairSetter, context.subredditName, fresh);
  if (!flair.ok) {
    console.error(`[aguamesa] flair refresh failed for ${username}: ${flair.error}`);
  }
  return c.json(outcome.summary);
});

/** POST /share — real: posts the score comment as the player, once per night. */
api.post('/share', async (c) => {
  const username = loggedInUser();
  if (username === undefined) {
    return c.json({ error: 'Login required' }, 401);
  }
  const body = await readBody(c);
  if (!isRecord(body) || typeof body['dayId'] !== 'string') {
    return c.json({ error: 'Expected { dayId }' }, 400);
  }
  const day = resolvePostDay(context.postData);
  if (body['dayId'] !== day.dayId) {
    return c.json({ error: `Stale day: post plays ${day.dayId}` }, 400);
  }
  const postId = context.postId;
  if (postId === undefined) {
    return c.json({ error: 'Share from inside the nightly post' }, 400);
  }
  const outcome = await shareNight(store, commentPoster, day.dayId, username, postId);
  if (!outcome.ok) {
    return c.json({ error: outcome.error }, 400);
  }
  return c.json({ commentUrl: outcome.commentUrl });
});

/** GET /leaderboard?scope=day|all — real: top 50 plus the caller. */
api.get('/leaderboard', async (c) => {
  const username = loggedInUser();
  if (username === undefined) {
    return c.json({ error: 'Login required' }, 401);
  }
  const scopeParam = c.req.query('scope');
  if (scopeParam !== undefined && scopeParam !== 'day' && scopeParam !== 'all') {
    return c.json({ error: 'Expected scope=day or scope=all' }, 400);
  }
  const scope: BoardScope = scopeParam === 'all' ? 'all' : 'day';
  const day = resolvePostDay(context.postData);
  return c.json(await getLeaderboard(store, scope, day.dayId, username));
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

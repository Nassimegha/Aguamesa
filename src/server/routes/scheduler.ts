// src/server/routes/scheduler.ts — P3 (Task 3)
// Cron handlers (devvit.json scheduler.tasks). The daily-night task runs
// at 00:00 UTC and publishes the Service du Jour post.
//
// For tests and backfills, the task accepts an optional
// data.targetDayId (a YYYY-MM-DD string); without it, tonight (UTC) is
// published.
import { Hono } from 'hono';
import type { Context as HonoContext } from 'hono';
import { context, redis } from '@devvit/web/server';
import { publishNight } from '../daily';
import { todayDayId } from '../dates';
import { createNightPoster } from '../poster';
import type { Store } from '../redis';

export const scheduler = new Hono();

const store: Store = redis;
const poster = createNightPoster();

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

scheduler.post('/daily-night', async (c) => {
  const body = await readBody(c);
  let dayId = todayDayId();
  if (isRecord(body) && isRecord(body['data']) && typeof body['data']['targetDayId'] === 'string') {
    dayId = body['data']['targetDayId'];
  }
  const outcome = await publishNight(store, poster, context.subredditName, dayId);
  if (!outcome.ok) {
    console.error(`[aguamesa] daily-night failed for ${dayId}: ${outcome.error}`);
    return c.json({ error: outcome.error }, 500);
  }
  console.log(
    `[aguamesa] daily-night: night #${outcome.night} (${dayId}) → ${outcome.postId}` +
      `${outcome.fromFallback ? ' [fallback content]' : ''}` +
      `${outcome.replayed ? ' [replay]' : ''}`
  );
  return c.json({});
});

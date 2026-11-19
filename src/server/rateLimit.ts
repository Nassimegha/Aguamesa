// src/server/rateLimit.ts — P3 (Task 6)
// Simple per-user, per-route rate limiting (brief T6.2): fixed windows
// counted in Redis. The window index is part of the key, so windows roll
// over with no clock coordination; an opportunistic expire keeps old
// counters from piling up on real Redis.
import type { Store } from './redis';

export type RateLimit = {
  /** Max requests per window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
};

export type RateCheck = {
  allowed: boolean;
  remaining: number;
};

export function rateLimitKey(username: string, route: string, windowIndex: number): string {
  return `rl:${username}:${route}:${windowIndex}`;
}

export async function checkRateLimit(
  store: Store,
  username: string,
  route: string,
  rule: RateLimit,
  nowMs: number = Date.now()
): Promise<RateCheck> {
  const windowIndex = Math.floor(nowMs / 1000 / rule.windowSec);
  const key = rateLimitKey(username, route, windowIndex);
  const count = await store.incrBy(key, 1);
  if (count === 1) {
    // Hygiene only: the window rolls over by key even if this fails.
    await store.expire(key, rule.windowSec * 2).catch(() => undefined);
  }
  return { allowed: count <= rule.limit, remaining: Math.max(0, rule.limit - count) };
}

// src/server/redis.ts — P3 (Task 2)
// Redis keys and the Store interface. All server logic talks to a Store,
// never to the Devvit client directly, so unit tests can swap in the
// in-memory implementation from ./memoryStore (no Reddit access needed).
//
// Key layout (brief T2.1):
//   player:{user}                  PlayerState as JSON
//   day:{dayId}:pours:{user}       hash glassIndex -> PourResult JSON (first write wins)
//   day:{dayId}:glass:{i}:scores   sorted set username -> score (for beatPercent)
//   day:{dayId}:glass:{i}:crowd    hash { sum, count } in milli-units (for crowdLine)
//   lb:day:{dayId}                 sorted set username -> night total (Task 4)
//   lb:all                         sorted set username -> best total (Task 4)
//   lb:streak                      sorted set username -> best streak (Task 3)
//   day:{dayId}:night:{user}       NightSummary as JSON (Task 3)

// ---------- key builders ----------

export function playerKey(username: string): string {
  return `player:${username}`;
}

export function poursKey(dayId: string, username: string): string {
  return `day:${dayId}:pours:${username}`;
}

export function glassScoresKey(dayId: string, glassIndex: number): string {
  return `day:${dayId}:glass:${glassIndex}:scores`;
}

export function glassCrowdKey(dayId: string, glassIndex: number): string {
  return `day:${dayId}:glass:${glassIndex}:crowd`;
}

export function dayBoardKey(dayId: string): string {
  return `lb:day:${dayId}`;
}

export function allBoardKey(): string {
  return 'lb:all';
}

export function streakBoardKey(): string {
  return 'lb:streak';
}

export function nightKey(dayId: string, username: string): string {
  return `day:${dayId}:night:${username}`;
}

// ---------- Store interface (structural subset of Devvit's RedisClient) ----------

/** Sorted-set member, same shape as Devvit's ZMember ({ score, member }). */
export type StoreZMember = {
  score: number;
  member: string;
};

export type StoreZEntry = {
  member: string;
  score: number;
};

/**
 * Minimal Redis surface the game needs. Devvit's `redis` client satisfies
 * this interface structurally (asserted in routes/api.ts), and
 * ./memoryStore provides an in-memory twin for tests and local runs.
 */
export type Store = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<unknown>;
  /** Set hash field only if absent. Returns 1 when set, 0 when it existed. */
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<unknown>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  zAdd(key: string, ...members: StoreZMember[]): Promise<number>;
  /** 0-based rank, lowest score first. Undefined when the member is absent. */
  zRank(key: string, member: string): Promise<number | undefined>;
  zCard(key: string): Promise<number>;
  zScore(key: string, member: string): Promise<number | undefined>;
  /** Rank-based ascending range (Redis ZRANGE defaults). Stop is inclusive; -1 = last. */
  zRange(key: string, start: number, stop: number): Promise<StoreZEntry[]>;
  mGet(keys: string[]): Promise<(string | null)[]>;
  expire(key: string, seconds: number): Promise<unknown>;
};

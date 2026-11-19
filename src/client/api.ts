// src/client/api.ts — P3 (Task 1 skeleton)
// Typed client for every endpoint in contract 00 §6.2.
// Talks to the real Devvit server with plain fetch('/api/...').
// In local Vite dev (npm run dev:local, no Reddit server) use mockApi.ts
// instead — see src/client/main.ts. The two files share the GameApi
// interface, so P1/P2 code can swap them without changing call sites.
//
// No scoring here: the client sends only holdMs (PourRequest) and the
// server returns the score. Real scoring is Task 2, server-side, with
// P1's src/shared/pour.ts.

import type {
  DailyService,
  LeaderboardRow,
  NightSummary,
  PlayerState,
  PourRequest,
  PourResult,
} from '../shared/types';

export interface InitResponse {
  player: PlayerState;
  today: DailyService;
}

export interface ShareResponse {
  commentUrl: string;
}

export interface LevelCompleteResponse {
  stars: number;
  player: PlayerState;
}

export type LeaderboardScope = 'day' | 'all';

/** One typed method per §6.2 endpoint. Implemented by api.ts (real) and mockApi.ts (stub). */
export interface GameApi {
  /** GET /api/init — called when the post opens. */
  init(): Promise<InitResponse>;
  /** POST /api/pour — one try per glass per day; server refuses a replay. */
  pour(request: PourRequest): Promise<PourResult>;
  /** POST /api/night/finish — after the 5th glass. */
  finishNight(dayId: string): Promise<NightSummary>;
  /** POST /api/share — posts the result comment as the player (Task 4). */
  share(dayId: string): Promise<ShareResponse>;
  /** GET /api/leaderboard?scope=day|all — top 50 + the player. */
  leaderboard(scope: LeaderboardScope): Promise<LeaderboardRow[]>;
  /** POST /api/level/complete — Levels mode, server-recalculated. */
  completeLevel(levelId: string, scores: number[]): Promise<LevelCompleteResponse>;
  /** POST /api/decor/buy — returns the updated player. */
  buyDecor(item: string): Promise<PlayerState>;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export const api: GameApi = {
  init: () => requestJson<InitResponse>('/api/init'),

  pour: (request: PourRequest) => postJson<PourResult>('/api/pour', request),

  finishNight: (dayId: string) =>
    postJson<NightSummary>('/api/night/finish', { dayId }),

  share: (dayId: string) => postJson<ShareResponse>('/api/share', { dayId }),

  leaderboard: (scope: LeaderboardScope) =>
    requestJson<LeaderboardRow[]>(`/api/leaderboard?scope=${scope}`),

  completeLevel: (levelId: string, scores: number[]) =>
    postJson<LevelCompleteResponse>('/api/level/complete', { levelId, scores }),

  buyDecor: (item: string) => postJson<PlayerState>('/api/decor/buy', { item }),
};

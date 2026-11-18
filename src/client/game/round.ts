// src/client/game/round.ts — P1
// Plays several glasses in a row (01 Task 3).
//
//   playRound() : the generic loop: glass 1, 2, 3... (used by the night AND by Levels mode)
//   playNight() : the Daily Service: 5 glasses, POST /api/pour after each, then
//                 POST /api/night/finish after the last one.
//
// This file has NO 3D code: showing a glass and waiting for the pour is done by a
// `playGlass` function given from outside (see glassStage.ts). That keeps the sequence
// logic small, and testable in Node without a browser (round.test.ts).
//
// Latency rule (01 "Pièges"): the animation and onPourEnd never wait for the server.
// The server's answer arrives later in onServerResult (crowd line, beat %).

import type { DailyService, GlassSpec, NightSummary, PourRequest, PourResult } from '../../shared/types';
import type { PourOutcome } from './pourSession';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Called by playGlass when the finger goes down. */
export interface GlassHooks {
  onPourStart(): void;
}

/** Shows glass `spec`, lets the player pour once, resolves with the local result. */
export type PlayGlass = (spec: GlassSpec, index: number, hooks: GlassHooks) => Promise<PourOutcome>;

/** Events for P2 (customers, screens) and for the HUD. All optional. */
export interface RoundEvents {
  /** A new glass is on the counter: spawn customer `spec.customer`. */
  onGlassStart?(index: number, spec: GlassSpec): void;
  /** The finger went down on glass `index`. */
  onPourStart?(index: number): void;
  /** The drops have landed: `outcome.score` / `outcome.overflow` → customer.reactTo(). */
  onPourEnd?(index: number, outcome: PourOutcome): void;
}

export interface NightEvents extends RoundEvents {
  /** The server's answer for glass `index` (crowdLine, beatPercent). Can arrive after the next glass started. */
  onServerResult?(index: number, result: PourResult): void;
  /** Glass `index` was already played today (post reopened): it is skipped. */
  onGlassSkipped?(index: number): void;
  /** After the 5th glass, with the server's summary (total, tips, streak, shareText). */
  onNightEnd?(summary: NightSummary): void;
  /** A request failed even after retries. The night continues when it can. */
  onError?(error: unknown): void;
}

/** The two endpoints a night needs. P3's `api` (src/client/api.ts) fits this shape as-is. */
export interface NightApi {
  pour(request: PourRequest): Promise<PourResult>;
  finishNight(dayId: string): Promise<NightSummary>;
}

export interface RoundOptions {
  glasses: readonly GlassSpec[];
  playGlass: PlayGlass;
  events?: RoundEvents;
  /** Glasses to skip (already played). */
  skip?: readonly boolean[];
  /** Pause after each pour so the customer can react, in ms. Default 1400. */
  pauseMs?: number;
  /** Injected for tests. Default: setTimeout. */
  wait?: (ms: number) => Promise<void>;
  /** Called right after each pour (before the pause). Used by playNight to send it to the server. */
  afterPour?(index: number, outcome: PourOutcome): void;
}

export const DEFAULT_PAUSE_MS = 1400;
/** Waits before each retry of a failed request. Two retries, then give up. */
export const RETRY_DELAYS_MS: readonly number[] = [500, 1500];

const defaultWait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Generic round
// ---------------------------------------------------------------------------

/**
 * Plays the glasses one after the other. Returns one outcome per glass, or `null`
 * for a skipped glass.
 */
export async function playRound(options: RoundOptions): Promise<(PourOutcome | null)[]> {
  const { glasses, playGlass, events = {}, skip = [], pauseMs = DEFAULT_PAUSE_MS } = options;
  const wait = options.wait ?? defaultWait;
  const outcomes: (PourOutcome | null)[] = [];

  for (let index = 0; index < glasses.length; index++) {
    const spec = glasses[index]!;
    if (skip[index] === true) {
      outcomes.push(null);
      continue;
    }
    events.onGlassStart?.(index, spec);
    const outcome = await playGlass(spec, index, {
      onPourStart: () => events.onPourStart?.(index),
    });
    outcomes.push(outcome);
    events.onPourEnd?.(index, outcome);
    options.afterPour?.(index, outcome);
    await wait(pauseMs); // the customer reacts, the score shows
  }
  return outcomes;
}

// ---------------------------------------------------------------------------
// Daily Service night
// ---------------------------------------------------------------------------

export interface NightOptions {
  today: DailyService;
  api: NightApi;
  playGlass: PlayGlass;
  events?: NightEvents;
  /** From PlayerState.playedToday: glasses already played are skipped (one try per day). */
  playedToday?: readonly boolean[];
  pauseMs?: number;
  wait?: (ms: number) => Promise<void>;
}

export interface NightResult {
  /** The server's summary. */
  summary: NightSummary;
  /** Local outcome per glass (null = skipped because already played). */
  outcomes: (PourOutcome | null)[];
  /** Server answer per glass (null = skipped, or the request failed). */
  serverResults: (PourResult | null)[];
}

/**
 * The whole Daily Service: plays today's glasses, sends each holdMs to the server,
 * then asks the server for the night summary. Throws only if the summary itself fails.
 */
export async function playNight(options: NightOptions): Promise<NightResult> {
  const { today, api, events = {} } = options;
  const wait = options.wait ?? defaultWait;
  const serverResults: (PourResult | null)[] = today.glasses.map(() => null);
  const pending: Promise<void>[] = [];
  const skip = today.glasses.map((_, i) => options.playedToday?.[i] === true);

  skip.forEach((skipped, index) => {
    if (skipped) events.onGlassSkipped?.(index);
  });

  const outcomes = await playRound({
    glasses: today.glasses,
    playGlass: options.playGlass,
    events,
    skip,
    wait,
    ...(options.pauseMs !== undefined ? { pauseMs: options.pauseMs } : {}),
    afterPour(index, outcome) {
      // Sent in the background: the next glass does not wait for it.
      const request: PourRequest = { dayId: today.dayId, glassIndex: index, holdMs: outcome.holdMs };
      pending.push(
        withRetry(() => api.pour(request), wait).then(
          (result) => {
            serverResults[index] = result;
            if (result.score !== outcome.score) {
              // Should never happen (same pour.ts on both sides). The server wins.
              console.warn(`glass ${index}: server score ${result.score} ≠ local ${outcome.score}`);
            }
            events.onServerResult?.(index, result);
          },
          (error: unknown) => events.onError?.(error),
        ),
      );
    },
  });

  // Every pour must be recorded before the night can be closed.
  await Promise.all(pending);
  const summary = await withRetry(() => api.finishNight(today.dayId), wait);
  events.onNightEnd?.(summary);
  return { summary, outcomes, serverResults };
}

/** Runs `task`; on failure waits and tries again (RETRY_DELAYS_MS), then rethrows the last error. */
export async function withRetry<T>(
  task: () => Promise<T>,
  wait: (ms: number) => Promise<void> = defaultWait,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;
      await wait(delay);
    }
  }
  throw lastError;
}

// src/client/game/pourSession.ts — P1
// One glass, from "ready" to "result": press → liquid rises → release → last drops → score.
//
// The animation uses the SAME functions as the server (shared/pour.ts), so the level on
// screen is exactly the `level` the server will return (01 Task 2.4). We never wait for the
// server to finish the animation (01 "Pièges : la latence").
//
//   while holding : level = levelAfter(spec, heldMs)
//   after release : level = levelAfter(spec, holdMs + t)   for t in 0..DRIP_MS
//   at the end    : level = pour(spec, holdMs).level        (== the server's value)
//
// Events for P2 (02 brief): onPourStart() and onPourEnd(outcome). `outcome` has
// `score` and `overflow`, so it can be passed straight to customer.reactTo().

import type { GlassSpec } from '../../shared/types';
import { DRIP_MS, levelAfter, pour } from '../../shared/pour';
import type { Glass } from './glass';
import { createHoldInput, type HoldInput } from './input';
import { createLiquid, type Liquid, type LiquidColors } from './liquid';

export interface PourOutcome {
  /** Rounded to whole milliseconds: this exact value is what we send to POST /api/pour. */
  holdMs: number;
  /** Final level 0..1 (capped at 1 on overflow), identical to the server's PourResult.level. */
  level: number;
  /** 0..100, identical to the server's PourResult.score. */
  score: number;
  overflow: boolean;
}

export interface PourEvents {
  onPourStart?(): void;
  onPourEnd?(outcome: PourOutcome): void;
}

export type PourState = 'ready' | 'pouring' | 'dripping' | 'done';

export interface PourSession {
  readonly state: PourState;
  /** Resolves when the drops have landed and the score is known. */
  readonly finished: Promise<PourOutcome>;
  readonly liquid: Liquid;
  /** Call every frame (e.g. game.onTick(session.update)). */
  update(deltaSeconds: number): void;
  /** Stops listening to input and removes the liquid effects. */
  dispose(): void;
}

export interface PourSessionOptions {
  glass: Glass;
  spec: GlassSpec;
  /** The element the player presses on (the game canvas). */
  inputElement: HTMLElement;
  events?: PourEvents;
  colors?: LiquidColors;
}

/**
 * Once the liquid is clearly over the rim, the pour stops by itself: holding longer
 * can't change the result (it's already 0), and the player sees the spill right away.
 */
const AUTO_STOP_LEVEL = 1.03;

export function createPourSession(options: PourSessionOptions): PourSession {
  const { glass, spec, events = {} } = options;
  const liquid = createLiquid(glass, options.colors);

  glass.setLine(spec.line);
  liquid.setLevel(0);

  let state: PourState = 'ready';
  let holdMs = 0;
  let dripElapsed = 0;
  let outcome: PourOutcome | null = null;

  let resolveFinished!: (o: PourOutcome) => void;
  const finished = new Promise<PourOutcome>((resolve) => {
    resolveFinished = resolve;
  });

  const input: HoldInput = createHoldInput(options.inputElement, {
    onPress() {
      if (state !== 'ready') return;
      state = 'pouring';
      liquid.setPouring(true);
      events.onPourStart?.();
    },
    onRelease(rawHoldMs: number) {
      if (state !== 'pouring') return;
      state = 'dripping';
      input.setEnabled(false); // one hold per glass
      holdMs = Math.round(rawHoldMs);
      dripElapsed = 0;
      outcome = { holdMs, ...pour(spec, holdMs) };
      liquid.setPouring(false);
    },
  });

  function update(deltaSeconds: number): void {
    if (state === 'pouring') {
      const level = levelAfter(spec, input.heldMs());
      liquid.setLevel(level);
      if (level >= AUTO_STOP_LEVEL) input.forceRelease();
    } else if (state === 'dripping' && outcome) {
      dripElapsed = Math.min(dripElapsed + deltaSeconds * 1000, DRIP_MS);
      if (dripElapsed < DRIP_MS) {
        liquid.setLevel(levelAfter(spec, holdMs + dripElapsed));
      } else {
        // Snap to the exact final value: this is what the server computes.
        liquid.setLevel(outcome.level);
        state = 'done';
        events.onPourEnd?.(outcome);
        resolveFinished(outcome);
      }
    }
    liquid.update(deltaSeconds);
  }

  return {
    get state() {
      return state;
    },
    finished,
    liquid,
    update,
    dispose() {
      input.dispose();
      liquid.dispose();
    },
  };
}

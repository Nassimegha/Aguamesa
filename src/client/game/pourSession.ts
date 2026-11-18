// src/client/game/pourSession.ts — P1
// One glass, from "ready" to "result": press → liquid rises → release → last drops →
// twist settles (foam, leak, ice) → score. Layered glasses (layers2/3) take one press per line.
//
// The animation uses the SAME functions as the server (shared/pour.ts), so the level on
// screen is exactly the `level` the server will return (01 Task 2.4). We never wait for the
// server to finish the animation (01 "Pièges : la latence").
//
//   pouring   : level = levelAfter(poured + heldMs) (+ ice once it fell) (+ foam)
//   dripping  : level = levelAfter(poured + hold + t), t in 0..DRIP_MS
//   settling  : foam shrinks to FOAM_HEAD, the leak drains leakAmount, a late ice cube falls
//   done      : level = pourSequence(spec, holds).level   (== the server's value)
//
// Events for P2 (02 brief): onPourStart() and onPourEnd(outcome). `outcome` has
// `score` and `overflow`, so it can be passed straight to customer.reactTo().

import type * as THREE from 'three';
import type { GlassSpec } from '../../shared/types';
import {
  DRIP_MS,
  FOAM_HEAD,
  ICE_RISE,
  foamAt,
  iceTrigger,
  isLayered,
  layerLines,
  leakAmount,
  levelAfter,
  overflowLimit,
  pourSequence,
} from '../../shared/pour';
import type { PourSound } from './audio';
import type { Glass } from './glass';
import { createHoldInput, type HoldInput } from './input';
import { createLiquid, type Liquid, type LiquidColors } from './liquid';
import { createTwistVisual, type PourPhase, type TwistFrame } from './twists';

export interface PourOutcome {
  /** Total of all presses, in whole milliseconds (what POST /api/pour sends as holdMs). */
  holdMs: number;
  /** Each press in whole ms: one entry, or one per line for layers2/3. */
  holds: number[];
  /** Final level 0..1 (capped at 1 on overflow), identical to the server's PourResult.level. */
  level: number;
  /** 0..100, identical to the server's PourResult.score. */
  score: number;
  overflow: boolean;
}

export interface PourEvents {
  /** The first press on this glass. */
  onPourStart?(): void;
  onPourEnd?(outcome: PourOutcome): void;
}

export type PourState = PourPhase;

export interface PourSession {
  readonly state: PourState;
  /** Resolves when the drops have landed, the twist has settled and the score is known. */
  readonly finished: Promise<PourOutcome>;
  readonly liquid: Liquid;
  /** Call every frame (e.g. game.onTick(session.update)). */
  update(deltaSeconds: number): void;
  /** Stops listening to input and removes the liquid and twist effects. */
  dispose(): void;
}

export interface PourSessionOptions {
  glass: Glass;
  spec: GlassSpec;
  /** The element the player presses on (the game canvas). */
  inputElement: HTMLElement;
  events?: PourEvents;
  colors?: LiquidColors;
  /** Lets the spin twist know where the player is. Optional. */
  camera?: THREE.Camera;
  /** Sounds and vibration (audio.ts). Optional: without it the pour is silent. */
  sound?: PourSound;
}

/**
 * Once the liquid is clearly over the spill limit, the pour stops by itself: holding longer
 * can't change the result (it's already 0), and the player sees the spill right away.
 */
const AUTO_STOP_MARGIN = 0.03;

/** How long the twist takes to settle after the drops (ms). */
function settleMsFor(spec: GlassSpec, iceAlreadyIn: boolean): number {
  switch (spec.twist) {
    case 'foam':
      return 900;
    case 'leak':
      return 1200;
    case 'ice':
      return iceAlreadyIn ? 0 : 350;
    default:
      return 0;
  }
}

/** Smooth 0 → 1 (ease in-out). */
const ease = (k: number): number => k * k * (3 - 2 * k);

export function createPourSession(options: PourSessionOptions): PourSession {
  const { glass, spec, events = {}, sound } = options;
  const liquid = createLiquid(glass, options.colors);
  const twist = createTwistVisual({
    glass,
    liquid,
    spec,
    ...(options.camera ? { camera: options.camera } : {}),
  });

  const presses = layerLines(spec).length;
  const trigger = iceTrigger(spec);
  const leak = leakAmount(spec);
  const autoStopLevel = overflowLimit(spec) + AUTO_STOP_MARGIN;
  glass.setLines(layerLines(spec));
  liquid.setLevel(0);

  let state: PourState = 'ready';
  const holds: number[] = [];
  const layerLevels: number[] = [];
  let pouredMs = 0; // layers: pouring time of the presses already finished (holds + drips)
  let hold = 0; // current press, whole ms
  let phaseMs = 0; // time spent in 'dripping' or 'settling'
  let settleMs = 0;
  let iceIn = false;
  let foam = 0;
  let shown = 0;
  let time = 0;
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
      sound?.pourStart();
      twist.onPourStart?.(holds.length);
      if (holds.length === 0) events.onPourStart?.();
    },
    onRelease(rawHoldMs: number) {
      if (state !== 'pouring') return;
      state = 'dripping';
      input.setEnabled(false); // wait for this press to finish before the next one
      hold = Math.round(rawHoldMs);
      holds.push(hold);
      phaseMs = 0;
      liquid.setPouring(false);
      sound?.pourStop(shown);
      twist.onRelease?.(holds.length - 1);
    },
  });

  /** Liquid alone (no ice, foam or leak) after `ms` of the current press. */
  const liquidAt = (ms: number): number => levelAfter(spec, pouredMs + ms);

  function finishPress(): void {
    pouredMs += hold + DRIP_MS;
    layerLevels.push(levelAfter(spec, pouredMs));
    const spilled = shown > overflowLimit(spec);
    if (isLayered(spec) && holds.length < presses && !spilled) {
      state = 'ready'; // next layer
      input.setEnabled(true);
      return;
    }
    const detail = pourSequence(spec, holds);
    outcome = {
      holdMs: holds.reduce((sum, h) => sum + h, 0),
      holds: [...holds],
      level: Math.min(detail.level, 1),
      score: detail.score,
      overflow: detail.overflow,
    };
    // Snap to the exact final value: this is what the server computes.
    shown = outcome.level;
    foam = spec.twist === 'foam' && shown > 0 ? FOAM_HEAD : 0;
    state = 'done';
    sound?.result(outcome);
    events.onPourEnd?.(outcome);
    resolveFinished(outcome);
  }

  function update(deltaSeconds: number): void {
    time += deltaSeconds;

    if (state === 'pouring') {
      const held = input.heldMs();
      const liquidLevel = liquidAt(held);
      if (liquidLevel >= trigger) iceIn = true;
      foam = foamAt(spec, held);
      shown = liquidLevel + (iceIn ? ICE_RISE : 0) + foam;
      sound?.pourLevel(shown);
      if (shown >= autoStopLevel) input.forceRelease();
    } else if (state === 'dripping') {
      phaseMs = Math.min(phaseMs + deltaSeconds * 1000, DRIP_MS);
      const liquidLevel = liquidAt(hold + phaseMs);
      if (liquidLevel >= trigger) iceIn = true;
      shown = liquidLevel + (iceIn ? ICE_RISE : 0) + foam;
      if (phaseMs >= DRIP_MS) {
        settleMs = settleMsFor(spec, iceIn);
        phaseMs = 0;
        if (settleMs > 0) state = 'settling';
        else finishPress();
      }
    } else if (state === 'settling') {
      phaseMs = Math.min(phaseMs + deltaSeconds * 1000, settleMs);
      const k = ease(phaseMs / settleMs);
      const liquidLevel = liquidAt(hold + DRIP_MS);
      if (spec.twist === 'ice' && liquidLevel > 0) iceIn = true; // a late cube still falls
      const peakFoam = foamAt(spec, hold);
      foam = spec.twist === 'foam' ? peakFoam + (FOAM_HEAD - peakFoam) * k : 0;
      shown = Math.max(0, liquidLevel + (iceIn ? ICE_RISE : 0) + foam - leak * k);
      if (phaseMs >= settleMs) finishPress();
    }

    liquid.setLevel(shown);
    const frame: TwistFrame = {
      phase: state,
      level: shown,
      foam,
      iceIn,
      layerLevels,
      press: holds.length - (state === 'ready' ? 0 : 1),
      time,
    };
    twist.update(deltaSeconds, frame);
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
      twist.dispose();
      liquid.dispose();
    },
  };
}

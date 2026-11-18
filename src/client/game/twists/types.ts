// src/client/game/twists/types.ts — P1
// What every twist visual receives and must provide.
// The SCORE side of each twist lives in shared/pour.ts (deterministic, same as the server);
// these files only draw it.

import type * as THREE from 'three';
import type { GlassSpec } from '../../../shared/types';
import type { Glass } from '../glass';
import type { Liquid } from '../liquid';

export type PourPhase = 'ready' | 'pouring' | 'dripping' | 'settling' | 'done';

/** Everything a twist needs to know about the pour, every frame. */
export interface TwistFrame {
  phase: PourPhase;
  /** The level drawn this frame (liquid + ice + foam). */
  level: number;
  /** Foam thickness this frame (foam twist), level units. */
  foam: number;
  /** true once the ice cube is in the glass (ice twist). */
  iceIn: boolean;
  /** layers: final level of each press already finished. */
  layerLevels: readonly number[];
  /** Index of the current press (0 for single-press glasses). */
  press: number;
  /** Seconds since the glass appeared. */
  time: number;
}

export interface TwistContext {
  glass: Glass;
  liquid: Liquid;
  spec: GlassSpec;
  /** Needed by spin (is the line facing the player?). Optional. */
  camera?: THREE.Camera;
}

export interface TwistVisual {
  /** The finger went down (press = 0, 1, 2 for layers). */
  onPourStart?(press: number): void;
  onRelease?(press: number): void;
  update(deltaSeconds: number, frame: TwistFrame): void;
  /** Removes everything the twist added and puts the glass back as it was. */
  dispose(): void;
}

/** A twist that does nothing (twist "none"). */
export const NO_TWIST: TwistVisual = { update() {}, dispose() {} };

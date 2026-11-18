// src/client/game/glassStage.ts — P1
// The 3D side of a round: the real `playGlass` used by round.ts / levelPlayer.ts.
// Puts glass N on the counter, lets the player pour once, keeps it visible until the
// next glass replaces it.

import type * as THREE from 'three';
import type { GlassSpec } from '../../shared/types';
import { loadGlass, type Glass, type GlbLoader } from './glass';
import type { LiquidColors } from './liquid';
import { createPourSession, type PourSession } from './pourSession';
import type { GlassHooks, PlayGlass } from './round';

/** What the stage needs from P2's GameScene (world/scene.ts). */
export interface StageScene {
  readonly scene: THREE.Scene;
  loadGLB: GlbLoader;
  onTick(listener: (deltaSeconds: number) => void): () => void;
}

export interface GlassStageOptions {
  game: StageScene;
  /** The element the player presses on (the game canvas). */
  inputElement: HTMLElement;
  /** Where the glass goes, e.g. LoadedLocation.placeGlass from world/location.ts. */
  placeGlass?(root: THREE.Object3D): void;
  colors?: LiquidColors;
  baseUrl?: string;
}

export interface GlassStage {
  playGlass: PlayGlass;
  /** The glass on the counter right now (null before the first one). */
  readonly current: { glass: Glass; session: PourSession } | null;
  /** Removes the last glass (end of the night). */
  clear(): void;
}

export function createGlassStage(options: GlassStageOptions): GlassStage {
  const { game } = options;
  let current: { glass: Glass; session: PourSession; stopTick: () => void } | null = null;

  function clear(): void {
    if (!current) return;
    current.stopTick();
    current.session.dispose();
    current.glass.dispose();
    current = null;
  }

  async function playGlass(spec: GlassSpec, _index: number, hooks: GlassHooks) {
    clear();
    const glass = await loadGlass((url) => game.loadGLB(url), spec.model, options.baseUrl);
    options.placeGlass?.(glass.root);
    game.scene.add(glass.root);

    const session = createPourSession({
      glass,
      spec,
      inputElement: options.inputElement,
      events: { onPourStart: hooks.onPourStart },
      ...(options.colors ? { colors: options.colors } : {}),
    });
    const stopTick = game.onTick((dt) => session.update(dt));
    current = { glass, session, stopTick };
    return session.finished;
  }

  return {
    playGlass,
    get current() {
      return current ? { glass: current.glass, session: current.session } : null;
    },
    clear,
  };
}

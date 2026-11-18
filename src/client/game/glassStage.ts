// src/client/game/glassStage.ts — P1
// The 3D side of a round: the real `playGlass` used by round.ts / levelPlayer.ts.
// Puts glass N on the counter, lets the player pour once, keeps it visible until the
// next glass replaces it.

import type * as THREE from 'three';
import type { GlassSpec } from '../../shared/types';
import type { PourSound } from './audio';
import { showCrowdLine, type CrowdLine, type CrowdLineData } from './crowdLine';
import { loadGlass, type Glass, type GlbLoader } from './glass';
import type { LiquidColors } from './liquid';
import { createPourSession, type PourSession } from './pourSession';
import type { GlassHooks, PlayGlass } from './round';

/** What the stage needs from P2's GameScene (world/scene.ts). */
export interface StageScene {
  readonly scene: THREE.Scene;
  /** Optional: lets the spin twist fade the line when it turns away from the player. */
  readonly camera?: THREE.Camera;
  /** Optional: used to prepare the shaders before the first press (see warmUpGlass). */
  readonly renderer?: THREE.WebGLRenderer;
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
  /** Sounds and vibration, shared by every glass (createGameAudio from audio.ts). */
  sound?: PourSound;
}

export interface GlassStage {
  playGlass: PlayGlass;
  /** The glass on the counter right now (null before the first one). */
  readonly current: { glass: Glass; session: PourSession; index: number } | null;
  /**
   * Shows the crowd line on glass `index` (call it from onServerResult). Ignored if that
   * glass is already gone (the server answered after the next glass appeared).
   */
  showCrowd(index: number, data: CrowdLineData): void;
  /** Removes the last glass (end of the night). */
  clear(): void;
}

/**
 * Compiles the shaders of everything in the glass NOW, including the parts that are still
 * hidden (the liquid at level 0, the stream, the ice cube, the drops...). Otherwise the GPU
 * compiles them the first time they appear, which is exactly during the first press: the
 * phone freezes for a moment and the pour feels wrong.
 */
export function warmUpGlass(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  root: THREE.Object3D,
): void {
  const hidden: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (!obj.visible) {
      hidden.push(obj);
      obj.visible = true;
    }
  });
  renderer.compile(scene, camera);
  for (const obj of hidden) obj.visible = false;
}

export function createGlassStage(options: GlassStageOptions): GlassStage {
  const { game } = options;
  let current: {
    glass: Glass;
    session: PourSession;
    index: number;
    crowd: CrowdLine | null;
    stopTick: () => void;
  } | null = null;

  function clear(): void {
    if (!current) return;
    current.stopTick();
    current.crowd?.dispose();
    current.session.dispose();
    current.glass.dispose();
    current = null;
  }

  async function playGlass(spec: GlassSpec, index: number, hooks: GlassHooks) {
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
      ...(game.camera ? { camera: game.camera } : {}),
      ...(options.sound ? { sound: options.sound } : {}),
    });
    if (game.renderer && game.camera) warmUpGlass(game.renderer, game.scene, game.camera, glass.root);
    const entry = { glass, session, index, crowd: null as CrowdLine | null, stopTick: () => {} };
    entry.stopTick = game.onTick((dt) => {
      session.update(dt);
      entry.crowd?.update(dt);
    });
    current = entry;
    return session.finished;
  }

  function showCrowd(index: number, data: CrowdLineData): void {
    if (!current || current.index !== index) return; // that glass is gone
    current.crowd?.dispose();
    current.crowd = showCrowdLine(current.glass, data, game.camera ? { camera: game.camera } : {});
  }

  return {
    playGlass,
    get current() {
      return current ? { glass: current.glass, session: current.session, index: current.index } : null;
    },
    showCrowd,
    clear,
  };
}

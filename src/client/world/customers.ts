// P2 (Nassime) : arrivée des clients, réactions branchées sur les événements de P1.
// P1 n'a pas encore livré onPourStart/onPourEnd(result)/onNightEnd(summary)
// (brief 02 §"Tu dépends de", prévu dim 23 nov). En attendant, ce module expose
// reactTo() directement ; P1 pourra l'appeler depuis onPourEnd une fois prêt.
import * as THREE from 'three';
import type { GameScene } from './scene';

export type CustomerId = 'giant' | 'fairy' | 'ghost';

const CUSTOMER_GLB: Record<CustomerId, string> = {
  giant: '/assets/models/char_giant.glb',
  fairy: '/assets/models/char_fairy.glb',
  ghost: '/assets/models/char_ghost.glb',
};

const ANIMATION_NAMES = ['idle', 'happy', 'meh', 'splashed'] as const;
type AnimationName = (typeof ANIMATION_NAMES)[number];

/** Forme minimale de PourResult (00 §6.1) dont une réaction a besoin. */
export interface PourOutcome {
  score: number;
  overflow: boolean;
}

export interface Customer {
  readonly id: CustomerId;
  readonly root: THREE.Object3D;
  /** Rejoue idle en boucle (appel au départ, ou pour revenir à l'attente). */
  idle(): void;
  /** Choisit happy / meh / splashed selon le résultat (brief 02 Tâche 3). */
  reactTo(outcome: PourOutcome): void;
  dispose(): void;
}

export function outcomeToAnimation(outcome: PourOutcome): AnimationName {
  if (outcome.overflow) return 'splashed';
  if (outcome.score >= 95) return 'happy';
  return 'meh';
}

export async function spawnCustomer(
  game: GameScene,
  id: CustomerId,
  position: THREE.Vector3 = new THREE.Vector3(),
): Promise<Customer> {
  const root = await game.loadGLB(CUSTOMER_GLB[id]);
  root.position.copy(position);
  game.scene.add(root);

  const mixer = new THREE.AnimationMixer(root);
  const clips = new Map<AnimationName, THREE.AnimationClip>();
  for (const name of ANIMATION_NAMES) {
    const clip = THREE.AnimationClip.findByName(root.animations, name);
    if (clip) clips.set(name, clip);
    else console.warn(`char_${id}.glb : animation "${name}" introuvable`);
  }

  let current: THREE.AnimationAction | null = null;

  function play(name: AnimationName, loop: boolean): void {
    const clip = clips.get(name);
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    if (current && current !== action) current.crossFadeTo(action, 0.15, false);
    action.play();
    current = action;
  }

  const unsubscribe = game.onTick((deltaSeconds) => mixer.update(deltaSeconds));

  function idle(): void {
    play('idle', true);
  }

  function reactTo(outcome: PourOutcome): void {
    play(outcomeToAnimation(outcome), false);
  }

  function dispose(): void {
    unsubscribe();
    game.scene.remove(root);
  }

  idle();

  return { id, root, idle, reactTo, dispose };
}

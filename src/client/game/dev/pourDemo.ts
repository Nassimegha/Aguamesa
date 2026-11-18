// src/client/game/dev/pourDemo.ts — P1, local test bench only (never shipped in the post).
// Open: npm run dev:local, then http://localhost:5173/src/client/game/dev/pour.html
//
// URL options:
//   ?model=pint|mug_giant|thimble|flute|coconut|teacup|goblet|tankard   (default pint)
//   &line=0.7  &flow=1   &loc=cafe|beach|chalet|none                    (default cafe)
//
// Press and hold anywhere to pour, release to stop. Tap again after the score to retry.

import * as THREE from 'three';
import type { GlassModel, GlassSpec } from '../../../shared/types';
import { GLASS_PROFILES } from '../../../shared/pour';
import { createScene } from '../../world/scene';
import { loadLocation } from '../../world/location';
import { loadGlass } from '../glass';
import { createPourSession, type PourOutcome, type PourSession } from '../pourSession';

const params = new URLSearchParams(window.location.search);
const model = (params.get('model') ?? 'pint') as GlassModel;
if (!(model in GLASS_PROFILES)) throw new Error(`unknown model "${model}"`);
const spec: GlassSpec = {
  model,
  line: Number(params.get('line') ?? 0.7),
  flow: Number(params.get('flow') ?? 1),
  twist: 'none',
  customer: 'test',
};
const locParam = params.get('loc') ?? 'cafe';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const scoreEl = document.getElementById('score') as HTMLDivElement;
const game = createScene(canvas);

async function main(): Promise<void> {
  const glass = await loadGlass((url) => game.loadGLB(url), model);
  game.scene.add(glass.root);

  if (locParam === 'cafe' || locParam === 'beach' || locParam === 'chalet') {
    const loc = await loadLocation(game, locParam);
    loc.placeGlass(glass.root);
  } else {
    // No decor: frame the glass directly.
    const mid = glass.levelToLocalY(0.5);
    game.camera.position.set(0, mid + 0.12, 0.42);
    game.camera.lookAt(new THREE.Vector3(0, mid, 0));
  }

  let session: PourSession | null = null;
  let lastOutcome: PourOutcome | undefined;
  hud.style.whiteSpace = 'pre';

  function showHud(): void {
    const base = `${model} · ligne ${spec.line} · flow ${spec.flow}${glass.isFallback ? ' · (cylindre de secours)' : ''}`;
    const live = `niveau ${(session?.liquid.level ?? 0).toFixed(4)}`;
    const result = lastOutcome
      ? ` · dernier : ${lastOutcome.holdMs} ms → ${lastOutcome.level.toFixed(4)} = ${lastOutcome.score}`
      : '';
    hud.textContent = `${base}\n${live}${result}`;
  }

  function startGlass(): void {
    session?.dispose();
    scoreEl.classList.remove('show');
    session = createPourSession({
      glass,
      spec,
      inputElement: canvas,
      events: {
        onPourStart: () => console.log('onPourStart'),
        onPourEnd: (outcome) => {
          console.log(`onPourEnd ${JSON.stringify(outcome)}`);
          lastOutcome = outcome;
          scoreEl.textContent = outcome.overflow ? 'Débordement ! 0' : String(outcome.score);
          scoreEl.classList.add('show');
          // A NEW tap (press + release) restarts. Listening for pointerdown first matters:
          // after an auto-stop the finger may still be down, and its release must not count.
          setTimeout(() => {
            canvas.addEventListener(
              'pointerdown',
              () => canvas.addEventListener('pointerup', startGlass, { once: true }),
              { once: true },
            );
          }, 400);
        },
      },
    });
  }

  startGlass();
  game.onTick((dt) => {
    session?.update(dt);
    showHud();
  });
  game.start();

  // ?auto=1500 : simulates a 1500 ms press with real pointer events (for automatic checks).
  const auto = Number(params.get('auto'));
  if (auto > 0) {
    const pointer = { isPrimary: true, pointerId: 1, button: 0, pointerType: 'touch', bubbles: true };
    setTimeout(() => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', pointer));
      setTimeout(() => canvas.dispatchEvent(new PointerEvent('pointerup', pointer)), auto);
    }, 500);
  }
}

main().catch((error) => {
  console.error(error);
  hud.textContent = `Erreur : ${String(error)}`;
});

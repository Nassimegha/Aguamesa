// src/client/game/dev/pourDemo.ts — P1, local test bench only (never shipped in the post).
// Open: npm run dev:local, then http://localhost:5173/src/client/game/dev/pour.html
//
// URL options:
//   ?model=pint|mug_giant|thimble|flute|coconut|teacup|goblet|tankard   (default pint)
//   &line=0.7  &flow=1   &loc=cafe|beach|chalet|none                    (default cafe)
//   &twist=none|layers2|layers3|foam|ice|spin|tilt|leak|steam|hidden_line (default none)
//   &auto=1500 : simulates one press of 1500 ms
//   &auto=ideal: simulates the perfect presses (one per line for layers)
//
// Press and hold anywhere to pour, release to stop. Tap again after the score to retry.

import * as THREE from 'three';
import type { GlassModel, GlassSpec, Twist } from '../../../shared/types';
import { GLASS_PROFILES, idealHolds } from '../../../shared/pour';
import { createScene } from '../../world/scene';
import { loadLocation } from '../../world/location';
import { createGameAudio } from '../audio';
import { showCrowdLine, type CrowdLine } from '../crowdLine';
import { loadGlass } from '../glass';
import { warmUpGlass } from '../glassStage';
import { glassScreenPoint, showTutorialIfFirstTime } from '../tutorial';
import { createPourSession, type PourOutcome, type PourSession } from '../pourSession';

const params = new URLSearchParams(window.location.search);
const model = (params.get('model') ?? 'pint') as GlassModel;
if (!(model in GLASS_PROFILES)) throw new Error(`unknown model "${model}"`);
const spec: GlassSpec = {
  model,
  line: Number(params.get('line') ?? 0.7),
  flow: Number(params.get('flow') ?? 1),
  twist: (params.get('twist') ?? 'none') as Twist,
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
  let crowd: CrowdLine | null = null;
  let lastOutcome: PourOutcome | undefined;
  const sound = createGameAudio({ onPlay: (name) => console.log(`SOUND ${name}`) });
  (window as unknown as { __sound: typeof sound }).__sound = sound; // test bench only: lets checks call it
  hud.style.whiteSpace = 'pre';

  function showHud(): void {
    const base = `${model} · ${spec.twist} · ligne ${spec.line} · flow ${spec.flow}${glass.isFallback ? ' · (cylindre de secours)' : ''}`;
    const live = `niveau ${(session?.liquid.level ?? 0).toFixed(4)}`;
    const result = lastOutcome
      ? ` · dernier : ${lastOutcome.holdMs} ms → ${lastOutcome.level.toFixed(4)} = ${lastOutcome.score}`
      : '';
    hud.textContent = `${base}\n${live}${result}`;
  }

  function startGlass(): void {
    session?.dispose();
    crowd?.dispose();
    crowd = null;
    scoreEl.classList.remove('show');
    session = createPourSession({
      glass,
      spec,
      inputElement: canvas,
      camera: game.camera,
      sound,
      events: {
        onPourStart: () => console.log('onPourStart'),
        onPourEnd: (outcome) => {
          console.log(`onPourEnd ${JSON.stringify(outcome)}`);
          lastOutcome = outcome;
          scoreEl.textContent = outcome.overflow ? 'Débordement ! 0' : String(outcome.score);
          scoreEl.classList.add('show');
          // Fake server answer after 250 ms: the crowd stopped a bit under the line.
          setTimeout(() => {
            crowd = showCrowdLine(
              glass,
              { crowdLine: spec.line - 0.05, beatPercent: Math.round(outcome.score * 0.85) },
              { camera: game.camera },
            );
          }, 250);
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
    warmUpGlass(game.renderer, game.scene, game.camera, glass.root);
  }

  startGlass();
  // First visit (or ?tutorial=1): the animated hand shows how to pour, pointing at the glass.
  showTutorialIfFirstTime({
    inputElement: canvas,
    anchor: () => glassScreenPoint(glass, game.camera, canvas),
    force: params.has('tutorial'),
  });
  game.onTick((dt) => {
    session?.update(dt);
    crowd?.update(dt);
    showHud();
  });
  game.start();

  // ?auto=1500 or ?auto=ideal : simulates presses with real pointer events (for automatic checks).
  const autoParam = params.get('auto');
  const holds = autoParam === 'ideal' ? idealHolds(spec) : Number(autoParam) > 0 ? [Number(autoParam)] : [];
  if (holds.length > 0) {
    const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    const pointer = { isPrimary: true, pointerId: 1, button: 0, pointerType: 'touch', bubbles: true };
    // A function, so TypeScript re-reads `session` each time (it changes in startGlass).
    const currentState = (): string | undefined => (session as PourSession | null)?.state;
    void (async () => {
      await sleep(500);
      for (const holdMs of holds) {
        while (currentState() !== 'ready') await sleep(30);
        canvas.dispatchEvent(new PointerEvent('pointerdown', pointer));
        await sleep(holdMs);
        canvas.dispatchEvent(new PointerEvent('pointerup', pointer));
        await sleep(60);
      }
    })();
  }
}

main().catch((error) => {
  console.error(error);
  hud.textContent = `Erreur : ${String(error)}`;
});

// src/client/game/dev/nightDemo.ts — P1, local test bench only (never shipped in the post).
// Open: npm run dev:local, then
//   http://localhost:5173/src/client/game/dev/night.html                     (a full night, 5 glasses)
//   http://localhost:5173/src/client/game/dev/night.html?mode=level&id=cafe-03 (Levels mode)
// Add &auto=1 to let the page pour by itself (each glass lands ~1 % above its line).
// Add &tutorial=1 to see the first-time tutorial again.

import type { GlassSpec } from '../../../shared/types';
import { holdMsForLevel, idealHolds } from '../../../shared/pour';
import { createScene } from '../../world/scene';
import { loadLocation } from '../../world/location';
import { createGameAudio } from '../audio';
import { createGlassStage } from '../glassStage';
import { glassScreenPoint, showTutorialIfFirstTime } from '../tutorial';
import { playNight, type PlayGlass } from '../round';
import { playLevel } from '../levelPlayer';
import { loadLevel, levelIds } from '../levels';
import { MOCK_TODAY, createMockServer } from './mockServer';

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') === 'level' ? 'level' : 'night';
const auto = params.has('auto');

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const big = document.getElementById('big') as HTMLDivElement;
const game = createScene(canvas);

const lines: string[] = [];
function show(text: string, small = ''): void {
  big.innerHTML = '';
  big.append(text);
  if (small) {
    const s = document.createElement('small');
    s.textContent = small;
    big.append(s);
  }
  big.classList.add('show');
}
const hide = (): void => big.classList.remove('show');
const render = (): void => {
  hud.textContent = lines.join('\n');
};

async function main(): Promise<void> {
  const loc = await loadLocation(game, 'cafe');
  const sound = createGameAudio({ onPlay: (name) => console.log(`SOUND ${name}`) });
  const stage = createGlassStage({ game, inputElement: canvas, placeGlass: (root) => loc.placeGlass(root), sound });
  game.start();

  // With &auto=1, press and release by itself once the glass is ready.
  const playGlass: PlayGlass = auto ? autoPlayer(stage.playGlass, () => stage.current) : stage.playGlass;
  const server = createMockServer();

  const roundEvents = {
    onGlassStart(index: number, spec: GlassSpec) {
      hide();
      if (index === 0 && !auto) {
        // First visit (or ?tutorial=1): the hand points at the glass once it is on the counter.
        showTutorialIfFirstTime({
          inputElement: canvas,
          anchor: () => {
            const current = stage.current;
            if (!current) return { x: innerWidth / 2, y: innerHeight * 0.6 };
            return glassScreenPoint(current.glass, game.camera, canvas);
          },
          force: params.has('tutorial'),
        });
      }
      lines.push(`verre ${index + 1} · ${spec.model} · ligne ${spec.line} · client ${spec.customer}`);
      render();
    },
    onPourEnd(index: number, outcome: { score: number; overflow: boolean; holdMs: number }) {
      show(outcome.overflow ? 'Débordement !' : String(outcome.score));
      lines[lines.length - 1] += ` → ${outcome.holdMs} ms = ${outcome.score}`;
      render();
      console.log(`glass ${index} local ${JSON.stringify(outcome)}`);
    },
  };

  if (mode === 'night') {
    lines.push(`Nuit #${MOCK_TODAY.night} (${MOCK_TODAY.dayId})`);
    render();
    const { summary } = await playNight({
      today: MOCK_TODAY,
      api: server,
      playGlass,
      events: {
        ...roundEvents,
        onServerResult(index, result) {
          stage.showCrowd(index, result);
          lines.push(`   serveur verre ${index + 1}: ${result.score} · foule ${result.crowdLine.toFixed(2)} · battus ${result.beatPercent} %`);
          render();
          console.log(`glass ${index} server ${JSON.stringify(result)}`);
        },
        onError: (error) => console.error('server error', error),
      },
    });
    stage.clear();
    show(`${summary.total}`, summary.shareText);
    console.log(`NIGHT_END ${JSON.stringify(summary)}`);
  } else {
    const id = params.get('id') ?? 'cafe-03';
    const level = await loadLevel(id);
    lines.push(`Niveau ${level.id} · étoiles à ${level.stars.join(' / ')} · niveaux dispo : ${levelIds().join(', ')}`);
    render();
    const result = await playLevel({
      level,
      playGlass,
      api: server,
      events: {
        ...roundEvents,
        onLevelEnd: (r) => show('★'.repeat(r.stars) + '☆'.repeat(3 - r.stars), `total ${r.total}`),
        onServerConfirmed: (stars) => console.log(`LEVEL_SERVER stars=${stars}`),
      },
    });
    stage.clear();
    console.log(`LEVEL_END ${JSON.stringify(result)}`);
  }
}

/**
 * Wraps playGlass: each time the glass is ready, simulates one of the perfect presses
 * (idealHolds: one per line for layers), aiming ~1 % above the line on single-press glasses.
 */
function autoPlayer(
  play: PlayGlass,
  current: () => { session: { state: string } } | null,
): PlayGlass {
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  return async (spec, index, hooks) => {
    const before = current();
    const finished = play(spec, index, hooks);
    const holds = idealHolds(spec);
    if (holds.length === 1) holds[0] = holdMsForLevel(spec, spec.line + 0.01);
    const pointer = { isPrimary: true, pointerId: 7, button: 0, pointerType: 'touch', bubbles: true };
    for (const holdMs of holds) {
      while (current() === before || current()?.session.state !== 'ready') await sleep(30);
      canvas.dispatchEvent(new PointerEvent('pointerdown', pointer));
      await sleep(holdMs);
      canvas.dispatchEvent(new PointerEvent('pointerup', pointer));
      await sleep(60);
    }
    return finished;
  };
}

main().catch((error) => {
  console.error(error);
  hud.textContent = `Erreur : ${String(error)}`;
});

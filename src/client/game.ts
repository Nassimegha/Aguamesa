// src/client/game.ts — point d'entrée réel du jeu (remplace la démo Three.js du modèle).
// Branche : le monde 3D de P2 (world/*), le moteur de jeu de P1 (game/*), le serveur
// de P3 (api.ts / mockApi.ts), sur le parcours du Service du Jour (00 §2, les 7 étapes)
// et le mode Niveaux (00 §1, 10 niveaux par lieu, 1 à 3 étoiles).
import * as THREE from 'three';
import { api, type GameApi } from './api';
import { mockApi } from './mockApi';
import { createScene } from './world/scene';
import { loadLocation, type LocationId, type LoadedLocation } from './world/location';
import { spawnCustomer, type Customer, type CustomerId, type PourOutcome } from './world/customers';
import { loadMap } from './world/map';
import { showHome } from './ui/home';
import { showNightResult } from './ui/nightResult';
import { showLeaderboard } from './ui/leaderboard';
import { showShelf } from './ui/shelf';
import { streakLine } from './ui/streak';
import { showLevelSelect, showLevelResult, type LevelCard } from './ui/levels';
import { createHud, type Hud } from './ui/hud';
import type { Screen } from './ui/screen';
import { createGlassStage, type GlassStage } from './game/glassStage';
import { playNight } from './game/round';
import { playLevel } from './game/levelPlayer';
import { levelIds, loadLevel } from './game/levels';
import { createGameAudio } from './game/audio';
import type { DailyService, GlassSpec, Level, PlayerState } from '../shared/types';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const gameApi: GameApi = isLocal ? mockApi : api;

const KNOWN_CUSTOMERS: ReadonlySet<CustomerId> = new Set([
  'giant', 'fairy', 'ghost', 'surfer', 'crab_mister', 'mermaid', 'yeti', 'skier', 'grandma_bear', 'pirate', 'wizard',
]);
const KNOWN_LOCATIONS: ReadonlySet<string> = new Set(['cafe', 'beach', 'chalet']);

// Où se tient chaque client : derrière le comptoir, de côté pour ne pas cacher le verre.
// Les grands sont plus bas (debout derrière le bar), les petits posés sur le comptoir.
const CUSTOMER_SPOT: Record<CustomerId, THREE.Vector3> = {
  giant: new THREE.Vector3(0.32, -0.32, 0.7),
  yeti: new THREE.Vector3(0.32, -0.34, 0.7),
  grandma_bear: new THREE.Vector3(0.3, -0.22, 0.65),
  ghost: new THREE.Vector3(0.28, -0.12, 0.6),
  surfer: new THREE.Vector3(0.28, -0.12, 0.6),
  mermaid: new THREE.Vector3(0.28, -0.1, 0.6),
  fairy: new THREE.Vector3(0.2, 0, 0.02),
  skier: new THREE.Vector3(0.2, 0, 0.02),
  crab_mister: new THREE.Vector3(0.2, 0, 0.02),
  pirate: new THREE.Vector3(0.3, -0.34, 0.65),
  wizard: new THREE.Vector3(0.3, -0.34, 0.65),
  barista: new THREE.Vector3(-0.36, -0.34, 0.6),
};

const GREETINGS: Record<string, string> = {
  giant: 'The biggest mug you have, please!',
  fairy: 'Just a tiny drop… exactly to the line!',
  ghost: 'Boo… I mean, hello. Something warm?',
  pirate: "Fill her up, matey. No spillin'!",
  wizard: 'Pour wisely, young barista.',
};

const canvas = document.getElementById('bg') as HTMLCanvasElement;
const game = createScene(canvas);
game.start();

let activeScreen: Screen | null = null;
let player: PlayerState | null = null;
function closeScreen(): void {
  activeScreen?.unmount();
  activeScreen = null;
}

// Fondu noir entre deux scènes (carte → café, menu → niveau).
const fade = document.createElement('div');
fade.className = 'scene-fade';
document.body.appendChild(fade);
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function fadeOut(): Promise<void> {
  fade.classList.add('scene-fade--on');
  await wait(470);
}
function fadeIn(): void {
  fade.classList.remove('scene-fade--on');
}

/** Cadrage portrait : comptoir en bas, verre au centre, client derrière, bien visible. */
function frameGameplayCamera(): void {
  const portrait = game.camera.aspect < 1;
  game.camera.fov = portrait ? 62 : 45;
  game.camera.updateProjectionMatrix();
  if (portrait) {
    game.camera.position.set(0, 0.38, -0.92);
    game.camera.lookAt(0.02, 0.1, 0.4);
  } else {
    game.camera.position.set(0, 0.3, -0.5);
    game.camera.lookAt(0.08, 0.12, 0.3);
  }
}

// ---------------------------------------------------------------------------
// Une session au comptoir : décor, verre, clients, bulles, HUD. Partagée par le
// Service du Jour et le mode Niveaux.
// ---------------------------------------------------------------------------
interface CafeSession {
  loc: LoadedLocation;
  stage: GlassStage;
  hud: Hud;
  onGlassStart(index: number, spec: GlassSpec): void;
  onPourEnd(index: number, outcome: PourOutcome): void;
  close(): void;
}

async function openCafe(
  location: string,
  hudLabel: string,
  glassCount: number,
  options: { goal?: string; chalkNight: number; specials?: string[]; tips: boolean },
): Promise<CafeSession> {
  const locationId = KNOWN_LOCATIONS.has(location) ? (location as 'cafe' | 'beach' | 'chalet') : 'cafe';
  if (locationId !== location) console.warn(`[aguamesa] location "${location}" not built yet, using cafe`);
  const streak = player?.streak ?? 0;

  const loc = await loadLocation(game, locationId);
  frameGameplayCamera();
  fadeIn();
  const sound = createGameAudio();
  const stage = createGlassStage({ game, inputElement: canvas, placeGlass: (root) => loc.placeGlass(root), sound });
  const hud = createHud(hudLabel, options.goal, streak, options.tips);

  // L'ardoise : plats du jour + série (00 §1, « traits à la craie »).
  loc.setChalkboard({
    night: options.chalkNight,
    streak,
    specials: options.specials ?? ['Moonlight Latte', 'Giant Mug Stout', 'Fairy Fizz', 'Ghost Chai'],
  });

  // Bulle du client au-dessus de sa tête (UI_DIALOGUE_ANCHOR).
  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';
  document.body.appendChild(bubble);
  let bubbleUntil = 0;
  let clock = 0;
  const say = (text: string, seconds = 3.2): void => {
    bubble.textContent = text;
    bubbleUntil = clock + seconds;
  };
  const stopBubble = game.onTick((dt) => {
    clock += dt;
    const a = loc.dialogueAnchor;
    const show = !!a && clock < bubbleUntil;
    bubble.classList.toggle('speech-bubble--on', show);
    if (!a || !show) return;
    const p = a.getWorldPosition(new THREE.Vector3()).project(game.camera);
    const r = canvas.getBoundingClientRect();
    const x = THREE.MathUtils.clamp(r.left + (p.x * 0.5 + 0.5) * r.width, 110, innerWidth - 110);
    const y = THREE.MathUtils.clamp(r.top + (-p.y * 0.5 + 0.5) * r.height, 130, innerHeight * 0.45);
    bubble.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  });

  let firstGreeting = true;
  let activeCustomer: Customer | null = null;
  // Un client se charge en différé : s'il arrive après le verre suivant (ou la fin),
  // on le jette au lieu de l'afficher en double.
  let customerToken = 0;

  return {
    loc,
    stage,
    hud,
    onGlassStart(index, spec) {
      hud.setGlass(index, glassCount);
      const token = ++customerToken;
      activeCustomer?.dispose();
      activeCustomer = null;
      const streakTalk = firstGreeting ? streakLine(streak) : null;
      firstGreeting = false;
      say(streakTalk ?? GREETINGS[spec.customer] ?? 'Evening! What are you pouring tonight?');
      const id = spec.customer as CustomerId;
      if (!KNOWN_CUSTOMERS.has(id)) {
        console.warn(`[aguamesa] customer "${spec.customer}" not built yet, glass without customer`);
        return;
      }
      spawnCustomer(game, id, CUSTOMER_SPOT[id].clone())
        .then((c) => {
          if (token !== customerToken) c.dispose();
          else activeCustomer = c;
        })
        .catch((err: unknown) => console.error('spawnCustomer:', err));
    },
    onPourEnd(_index, outcome) {
      activeCustomer?.reactTo(outcome);
      hud.showPour(outcome.score, outcome.overflow);
      say(
        outcome.overflow ? 'Whoa! My shirt!' : outcome.score >= 95 ? 'Perfect. Just perfect!' : outcome.score >= 70 ? 'Not bad at all.' : 'Hmm… close enough?',
        2.2,
      );
    },
    close() {
      customerToken++;
      activeCustomer?.dispose();
      activeCustomer = null;
      stopBubble();
      bubble.remove();
      hud.dispose();
      stage.clear();
      sound.dispose();
      loc.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Service du Jour
// ---------------------------------------------------------------------------
async function playTonight(today: DailyService, visitLocation?: string): Promise<void> {
  const s = await openCafe(visitLocation ?? today.location, `Night #${today.night}`, today.glasses.length, {
    chalkNight: today.night,
    specials: [today.drinkOfTheDay ?? 'Moonlight Latte', 'Giant Mug Stout', 'Fairy Fizz', 'Ghost Chai'],
    tips: true,
  });
  await playNight({
    today,
    api: gameApi,
    playGlass: s.stage.playGlass,
    events: {
      onGlassStart: s.onGlassStart,
      onPourEnd: s.onPourEnd,
      onServerResult: (index, result) => {
        s.stage.showCrowd(index, result);
        s.hud.showServer(result);
      },
      onGlassSkipped: (index) => console.log(`[aguamesa] glass ${index + 1} already played today`),
      onError: (err) => console.error('[aguamesa] night:', err),
      onNightEnd: (summary) => {
        s.close();
        closeScreen();
        activeScreen = showNightResult(summary, {
          onShare: () => {
            void gameApi.share(summary.dayId).catch((err: unknown) => console.error('share:', err));
          },
          onClose: () => {
            closeScreen();
            void boot();
          },
        });
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Mode Niveaux (Midnight Café : cafe-01 … cafe-10)
// ---------------------------------------------------------------------------
const LEVEL_LOCATION: LocationId = 'cafe';
const levelCache = new Map<string, Level>();
async function getLevel(id: string): Promise<Level> {
  const hit = levelCache.get(id);
  if (hit) return hit;
  const level = await loadLevel(id);
  levelCache.set(id, level);
  return level;
}

const levelNum = (id: string): number => Number(id.slice(id.lastIndexOf('-') + 1));
const bestStars = (id: string): number => player?.stars[id] ?? 0;
/** Level 1 is open; each next level opens once the previous one has at least 1 star. */
function isUnlocked(ids: string[], i: number): boolean {
  return i === 0 || bestStars(ids[i - 1]!) >= 1;
}

async function openLevelSelect(): Promise<void> {
  closeScreen();
  const ids = levelIds(LEVEL_LOCATION);
  const levels = await Promise.all(ids.map(getLevel));
  const cards: LevelCard[] = levels.map((lv, i) => ({
    id: lv.id,
    num: levelNum(lv.id),
    stars: bestStars(lv.id),
    thresholds: lv.stars,
    glasses: lv.glasses.length,
    locked: !isUnlocked(ids, i),
  }));
  activeScreen = showLevelSelect('Midnight Café · Levels', cards, {
    onPlay: (id) => {
      closeScreen();
      playLevelById(id).catch((err: unknown) => console.error('[aguamesa] level:', err));
    },
    onClose: () => void boot(),
  });
}

async function playLevelById(id: string): Promise<void> {
  const level = await getLevel(id);
  const num = levelNum(id);
  await fadeOut();
  const s = await openCafe(level.location, `Level ${num}`, level.glasses.length, {
    goal: `★ ${level.stars[0]}`,
    chalkNight: player ? Math.max(1, player.serverLevel) : 1,
    tips: false,
  });
  const before = bestStars(id);
  const result = await playLevel({
    level,
    playGlass: s.stage.playGlass,
    api: gameApi,
    events: {
      onGlassStart: s.onGlassStart,
      onPourEnd: s.onPourEnd,
      onServerConfirmed: (_stars, p) => {
        player = p;
      },
      onError: (err) => console.error('[aguamesa] level/complete:', err),
    },
  });
  // Les étoiles s'affichent tout de suite (calcul local, même formule que le serveur) ;
  // on garde la meilleure note même si le serveur n'a pas encore répondu.
  if (player && result.stars > (player.stars[id] ?? 0)) player = { ...player, stars: { ...player.stars, [id]: result.stars } };
  s.close();

  const ids = levelIds(LEVEL_LOCATION);
  const i = ids.indexOf(id);
  const nextId = ids[i + 1];
  closeScreen();
  activeScreen = showLevelResult(
    {
      num,
      scores: result.scores,
      total: result.total,
      stars: result.stars,
      thresholds: level.stars,
      bestBefore: before,
      hasNext: nextId !== undefined,
      nextUnlocked: nextId !== undefined && isUnlocked(ids, i + 1),
    },
    {
      onReplay: () => {
        closeScreen();
        playLevelById(id).catch((err: unknown) => console.error('[aguamesa] level:', err));
      },
      onNext: () => {
        if (!nextId) return;
        closeScreen();
        playLevelById(nextId).catch((err: unknown) => console.error('[aguamesa] level:', err));
      },
      onClose: () => void openLevelSelect(),
    },
  );
}

// ---------------------------------------------------------------------------
// Accueil
// ---------------------------------------------------------------------------
async function boot(): Promise<void> {
  closeScreen();
  const init = await gameApi.init();
  const today = init.today;
  // Garde les étoiles gagnées pendant cette session si le mock ne les connaît pas.
  player = player ? { ...init.player, stars: { ...init.player.stars, ...player.stars } } : init.player;
  const me = player;
  console.log(`[aguamesa] night #${today.night} (${today.dayId}), location ${today.location}, streak 🔥${me.streak}`);

  activeScreen = showHome(me, {
    onServir: () => {
      closeScreen();
      playTonight(today).catch((err: unknown) => console.error('[aguamesa] playTonight:', err));
    },
    onLevels: () => {
      openLevelSelect().catch((err: unknown) => console.error('[aguamesa] levels:', err));
    },
    onCarte: () => {
      closeScreen();
      const unlocked = new Set<LocationId>(['cafe', 'beach', 'chalet', 'fair', 'pirate', 'castle']);
      let backBtn: HTMLButtonElement | null = null;
      let mapRef: { dispose(): void } | null = null;
      const enter = async (id: LocationId): Promise<void> => {
        await fadeOut();
        mapRef?.dispose();
        backBtn?.remove();
        await playTonight(today, id);
      };
      void loadMap(game, unlocked, (id) => {
        enter(id).catch((err: unknown) => console.error('[aguamesa] enter:', err));
      }).then((map) => {
        mapRef = map;
        backBtn = document.createElement('button');
        backBtn.className = 'btn btn--icon btn--ghost';
        backBtn.textContent = '←';
        backBtn.style.cssText = 'position:fixed;top:max(16px,env(safe-area-inset-top));left:16px;z-index:20;';
        backBtn.setAttribute('aria-label', 'Back');
        backBtn.addEventListener('click', () => {
          map.dispose();
          backBtn?.remove();
          void boot();
        });
        document.body.appendChild(backBtn);
      });
    },
    onClassement: () => {
      closeScreen();
      void gameApi.leaderboard('day').then((day) => {
        void gameApi.leaderboard('all').then((all) => {
          activeScreen = showLeaderboard({ day, all, currentUsername: me.username }, { onClose: () => void boot() });
        });
      });
    },
    onEtagere: () => {
      closeScreen();
      activeScreen = showShelf(me.collection, { onClose: () => void boot() });
    },
  });
}

boot().catch((err: unknown) => console.error('[aguamesa] boot:', err));

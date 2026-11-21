// src/client/game.ts — point d'entrée réel du jeu.
// Branche : le monde 3D de P2 (world/*), le moteur de jeu de P1 (game/*), le serveur
// de P3 (api.ts / mockApi.ts), sur :
//   - le Service du Jour (00 §2, les 7 étapes),
//   - le mode Niveaux (00 §1, 10 niveaux par lieu, 1 à 3 étoiles),
//   - la carte et le mode Visite (Carte → Enter : découvrir un lieu et ses 30 clients sans
//     consommer l'essai du jour ; lien direct ?visit=<lieu> pour l'équipe et le jury).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { api, type GameApi } from './api';
import { mockApi } from './mockApi';
import { createScene } from './world/scene';
import { loadLocation, type LocationId, type LoadedLocation } from './world/location';
import { spawnCustomer, type Customer, type PourOutcome } from './world/customers';
import { pickCustomers, rosterFor, spotFor, type CustomerInfo } from './world/roster';
import { loadMap } from './world/map';
import { showHome } from './ui/home';
import { showNightResult, showPracticeResult } from './ui/nightResult';
import { showLeaderboard } from './ui/leaderboard';
import { showShelf } from './ui/shelf';
import { streakLine } from './ui/streak';
import { showLevelSelect, showLevelResult, type LevelCard } from './ui/levels';
import { showVisitPanel } from './ui/visit';
import { createHud, tipFor, type Hud } from './ui/hud';
import type { Screen } from './ui/screen';
import { showLoadError } from './ui/error';
import { createGlassStage, type GlassStage } from './game/glassStage';
import { playNight, playRound } from './game/round';
import { playLevel } from './game/levelPlayer';
import { levelIds, loadLevel } from './game/levels';
import { createGameAudio } from './game/audio';
import type { DailyService, GlassSpec, Level, PlayerState } from '../shared/types';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const gameApi: GameApi = isLocal ? mockApi : api;

const LOCATIONS: readonly LocationId[] = ['cafe', 'beach', 'chalet', 'fair', 'pirate', 'castle'];
const isLocation = (v: string | null | undefined): v is LocationId => !!v && (LOCATIONS as readonly string[]).includes(v);

/**
 * Lieu 6 de la carte : la VRAIE nuit (Tonight's Shift), celle des joueurs Reddit — 1 essai par
 * nuit, score recalculé par le serveur, série 🔥, classement, partage.
 * Lieux 1 à 5 : Free Play — parties illimitées (équipe, jury, entraînement), mêmes règles et
 * même formule de score, sans rien envoyer au serveur. Changer de lieu « réel » = cette ligne.
 */
const REAL_SHIFT_LOCATION: LocationId = 'castle';
const isRealShift = (l: LocationId): boolean => l === REAL_SHIFT_LOCATION;

/** Names, one-line pitch (Visit mode) and the drinks on each location's chalkboard. */
const LOCATION_INFO: Record<LocationId, { name: string; blurb: string; specials: string[] }> = {
  cafe: { name: 'Midnight Café', blurb: 'Where every night begins. Hold to pour, release right on the line.',
    specials: ['Moonlight Latte', 'Giant Mug Stout', 'Fairy Fizz', 'Ghost Chai'] },
  beach: { name: 'Beach Bar', blurb: 'Coconuts, sea spray and a crab who tips in shells.',
    specials: ['Coconut Cooler', 'Sunset Punch', 'Sea Breeze', 'Mango Wave'] },
  chalet: { name: 'Mountain Chalet', blurb: 'Hot drinks by the fire. Mind the steam on cold glasses.',
    specials: ['Hot Cocoa', 'Spiced Cider', 'Alpine Tea', 'Marshmallow Melt'] },
  fair: { name: 'Funfair', blurb: 'Lights, prizes and a crowd that never stops moving.',
    specials: ['Cotton Candy Soda', 'Popcorn Shake', 'Lucky Lemonade', 'Carousel Cola'] },
  pirate: { name: 'Pirate Ship', blurb: 'Below deck, the lantern swings. So does your pour.',
    specials: ['Grog (No Rum)', 'Kraken Ink Tea', 'Treasure Tonic', 'Salty Sailor'] },
  castle: { name: 'Haunted Castle', blurb: 'Candles, cobwebs and customers who are mostly see-through.',
    specials: ['Phantom Punch', 'Bat Brew', 'Witch Hazel Tea', 'Pumpkin Spice'] },
};

const canvas = document.getElementById('bg') as HTMLCanvasElement;
const game = createScene(canvas);
game.start();

let activeScreen: Screen | null = null;
let player: PlayerState | null = null;
let today: DailyService | null = null;
function closeScreen(): void {
  activeScreen?.unmount();
  activeScreen = null;
}

// Fondu noir entre deux scènes (carte → lieu, menu → niveau).
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

/**
 * A 3D load failed (island, location, model): never leave the user on a black
 * screen. The fade sits above every screen (z-index), so clear it first, then
 * show a message with a way back home.
 */
function showFatalLoadError(
  title: string,
  err: unknown,
  options: { retry?: () => void | Promise<void>; map?: boolean } = {},
): void {
  console.error(`[aguamesa] ${title}:`, err);
  fadeIn();
  closeScreen();
  const retry = options.retry;
  const message = err instanceof Error && err.message ? err.message : String(err);
  activeScreen = showLoadError(title, message, {
    onHome: () => {
      closeScreen();
      boot().catch((bootErr: unknown) => console.error('[aguamesa] boot:', bootErr));
    },
    ...(retry
      ? {
          onRetry: () => {
            closeScreen();
            // A retry that fails shows the error again instead of black-screening.
            void Promise.resolve()
              .then(() => retry())
              .catch((retryErr: unknown) => showFatalLoadError(title, retryErr, options));
          },
        }
      : {}),
    ...(options.map
      ? {
          onMap: () => {
            closeScreen();
            openMap();
          },
        }
      : {}),
  });
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

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Télécharge à l'avance les .glb des clients et des verres d'une session (THREE.Cache les
 * garde) : quand le client suivant arrive, il apparaît tout de suite, sans saccade.
 */
const fileLoader = new THREE.FileLoader().setResponseType('arraybuffer');
function preload(urls: Iterable<string>): void {
  for (const u of new Set(urls)) fileLoader.load(u, undefined, undefined, () => {});
}

// ---------------------------------------------------------------------------
// Un client au comptoir + sa bulle de dialogue (suit le haut de sa tête).
// Partagé par le Service du Jour, les Niveaux et la Visite.
// ---------------------------------------------------------------------------
interface Counter {
  show(info: CustomerInfo): void;
  react(outcome: PourOutcome): void;
  say(name: string, text: string, seconds?: number): void;
  idle(): void;
  dispose(): void;
}

function createCounter(loc: LoadedLocation): Counter {
  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';
  document.body.appendChild(bubble);
  let bubbleUntil = 0;
  let clock = 0;
  let active: Customer | null = null;
  // Un client se charge en différé : s'il arrive après le suivant (ou la fin), on le jette.
  let token = 0;
  const box = new THREE.Box3();
  const head = new THREE.Vector3();
  let bx = -1;
  let by = -1;

  const stop = game.onTick((dt) => {
    clock += dt;
    const on = clock < bubbleUntil;
    bubble.classList.toggle('speech-bubble--on', on);
    if (!on) return;
    if (active) {
      box.setFromObject(active.root);
      head.set((box.min.x + box.max.x) / 2, box.max.y + 0.03, (box.min.z + box.max.z) / 2);
    } else if (loc.dialogueAnchor) {
      loc.dialogueAnchor.getWorldPosition(head);
    } else return;
    const p = head.project(game.camera);
    const r = canvas.getBoundingClientRect();
    const w = bubble.offsetWidth / 2 + 12;
    const x = THREE.MathUtils.clamp(r.left + (p.x * 0.5 + 0.5) * r.width, w, innerWidth - w);
    const y = THREE.MathUtils.clamp(r.top + (-p.y * 0.5 + 0.5) * r.height, 120, innerHeight * 0.62);
    // lissage : la bulle ne saute pas quand le client s'anime
    bx = bx < 0 ? x : bx + (x - bx) * Math.min(1, dt * 10);
    by = by < 0 ? y : by + (y - by) * Math.min(1, dt * 10);
    bubble.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -100%)`;
  });

  return {
    show(info) {
      const t = ++token;
      active?.dispose();
      active = null;
      bx = by = -1;
      spawnCustomer(game, info.id, spotFor(info.size))
        .then((c) => {
          if (t !== token) c.dispose();
          else active = c;
        })
        .catch((err: unknown) => console.error('[aguamesa] customer:', err));
    },
    react(outcome) {
      active?.reactTo(outcome);
    },
    say(name, text, seconds = 3.4) {
      bubble.innerHTML = `<b>${esc(name)}</b>${esc(text)}`;
      bubbleUntil = clock + seconds;
    },
    idle() {
      active?.idle();
    },
    dispose() {
      token++;
      active?.dispose();
      active = null;
      stop();
      bubble.remove();
    },
  };
}

const REACTION = (o: PourOutcome): string =>
  o.overflow ? 'Whoa! My shirt!' : o.score >= 95 ? 'Perfect. Just perfect!' : o.score >= 70 ? 'Not bad at all.' : 'Hmm... close enough?';

// ---------------------------------------------------------------------------
// Une session au comptoir : décor, verre, clients, bulles, HUD.
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
  location: LocationId,
  hudLabel: string,
  glasses: readonly GlassSpec[],
  options: { goal?: string; chalkNight: number; tips: boolean; seed?: string },
): Promise<CafeSession> {
  // Qui vient ce soir : tirage fixé par la date au Service du Jour (même soirée pour tout le
  // monde), au hasard en mode Niveaux. Les .glb partent tout de suite en téléchargement.
  const guests = pickCustomers(location, glasses.length, options.seed);
  preload([...guests.map((c) => `/assets/models/char_${c.id}.glb`), ...glasses.map((g) => `/assets/models/glass_${g.model}.glb`)]);
  const streak = player?.streak ?? 0;

  let loc: LoadedLocation;
  try {
    loc = await loadLocation(game, location);
  } catch (err: unknown) {
    // Callers only log: surface the failure here, or the user is stuck on a
    // black canvas (or behind the fade) with no way back.
    showFatalLoadError(`${LOCATION_INFO[location].name} didn't load`, err, { map: true });
    throw err;
  }
  frameGameplayCamera();
  fadeIn();
  const sound = createGameAudio();
  const stage = createGlassStage({ game, inputElement: canvas, placeGlass: (root) => loc.placeGlass(root), sound });
  const hud = createHud(hudLabel, options.goal, streak, options.tips);
  loc.setChalkboard({ night: options.chalkNight, streak, specials: LOCATION_INFO[location].specials });
  const counter = createCounter(loc);
  let current: CustomerInfo | null = null;

  return {
    loc,
    stage,
    hud,
    onGlassStart(index, spec) {
      hud.setGlass(index, glasses.length, spec.twist === 'layers3' ? 3 : spec.twist === 'layers2' ? 2 : 1);
      current = guests[index] ?? guests[0]!;
      counter.show(current);
      // Le premier client remarque la série (00 §1), les suivants disent leur réplique.
      const talk = index === 0 ? streakLine(streak) : null;
      counter.say(current.name, talk ?? current.line);
    },
    onPourEnd(_index, outcome) {
      counter.react(outcome);
      hud.showPour(outcome.score, outcome.overflow);
      if (current) counter.say(current.name, REACTION(outcome), 2.2);
    },
    close() {
      counter.dispose();
      hud.dispose();
      stage.clear();
      sound.dispose();
      loc.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Service du Jour : la vraie nuit, toujours au lieu 6 (REAL_SHIFT_LOCATION).
// ---------------------------------------------------------------------------
async function playTonight(night: DailyService): Promise<void> {
  const location = REAL_SHIFT_LOCATION;
  const s = await openCafe(location, `Night #${night.night}`, night.glasses, {
    chalkNight: night.night,
    tips: true,
    seed: night.dayId,
  });
  await playNight({
    today: night,
    api: gameApi,
    // Un seul essai par jour (00 §1) : les verres déjà versés sont sautés.
    playedToday: player?.playedToday ?? [],
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
          // jamais bloqué jusqu'au lendemain : on continue en Free Play
          onPlayMore: () => openMap(),
        });
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Free Play (lieux 1 à 5) : parties illimitées, pour l'équipe, le jury et l'entraînement.
// Même jeu (5 verres, même geste, même formule de score pour.ts, clients au hasard), mais
// rien n'est envoyé au serveur : pas de limite, et la série 🔥 / le classement restent justes.
// ---------------------------------------------------------------------------
function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** 5 glasses drawn from the levels P1 designed for this place (all levels if it has none). */
async function freePlayGlasses(location: LocationId, count = 5): Promise<GlassSpec[]> {
  const from = levelIds(location).length > 0 ? [location] : LEVEL_LOCATIONS;
  const levels = await Promise.all(from.flatMap((l) => levelIds(l)).map(getLevel));
  const picked = shuffle(levels.flatMap((lv) => lv.glasses)).slice(0, count);
  // the first glass without a twist, to warm up; the twisted ones come after
  return [...picked.filter((g) => g.twist === 'none'), ...picked.filter((g) => g.twist !== 'none')];
}

async function playFreePlay(location: LocationId): Promise<void> {
  const info = LOCATION_INFO[location];
  const glasses = await freePlayGlasses(location);
  const s = await openCafe(location, `${info.name} · Free Play`, glasses, {
    chalkNight: today?.night ?? 1,
    tips: false,
  });
  const outcomes = await playRound({
    glasses,
    playGlass: s.stage.playGlass,
    events: { onGlassStart: s.onGlassStart, onPourEnd: s.onPourEnd },
  });
  s.close();
  const scores = outcomes.map((o) => o?.score ?? 0);
  const total = scores.reduce((a, b) => a + b, 0);
  const streak = player?.streak ?? 0;
  closeScreen();
  activeScreen = showPracticeResult(
    { place: info.name, scores, total, tips: tipFor(total, streak), streak, realPlace: LOCATION_INFO[REAL_SHIFT_LOCATION].name },
    {
      onReplay: () => {
        closeScreen();
        void fadeOut().then(() => playFreePlay(location).catch((err: unknown) => console.error('[aguamesa] free play:', err)));
      },
      onMap: () => openMap(),
      onHome: () => void boot(),
    },
  );
}

// ---------------------------------------------------------------------------
// Mode Niveaux (10 niveaux par lieu qui en a : café, plage, chalet)
// ---------------------------------------------------------------------------
const levelCache = new Map<string, Level>();
async function getLevel(id: string): Promise<Level> {
  const hit = levelCache.get(id);
  if (hit) return hit;
  const level = await loadLevel(id);
  levelCache.set(id, level);
  return level;
}

const LEVEL_LOCATIONS = LOCATIONS.filter((l) => levelIds(l).length > 0);
const levelNum = (id: string): number => Number(id.slice(id.lastIndexOf('-') + 1));
const locationOfLevel = (id: string): LocationId => id.slice(0, id.lastIndexOf('-')) as LocationId;
const bestStars = (id: string): number => player?.stars[id] ?? 0;
/** Level 1 is open; each next level opens once the previous one has at least 1 star. */
function isUnlocked(ids: string[], i: number): boolean {
  return i === 0 || bestStars(ids[i - 1]!) >= 1;
}

async function openLevelSelect(location: LocationId = 'cafe'): Promise<void> {
  closeScreen();
  const ids = levelIds(location);
  const levels = await Promise.all(ids.map(getLevel));
  const cards: LevelCard[] = levels.map((lv, i) => ({
    id: lv.id,
    num: levelNum(lv.id),
    stars: bestStars(lv.id),
    thresholds: lv.stars,
    glasses: lv.glasses.length,
    locked: !isUnlocked(ids, i),
  }));
  activeScreen = showLevelSelect(
    'Levels',
    cards,
    {
      onPlay: (id) => {
        closeScreen();
        playLevelById(id).catch((err: unknown) => console.error('[aguamesa] level:', err));
      },
      onTab: (loc) => {
        if (isLocation(loc)) void openLevelSelect(loc);
      },
      onClose: () => void boot(),
    },
    LEVEL_LOCATIONS.map((l) => ({ id: l, label: LOCATION_INFO[l].name, active: l === location })),
  );
}

async function playLevelById(id: string): Promise<void> {
  const level = await getLevel(id);
  const num = levelNum(id);
  await fadeOut();
  const s = await openCafe(level.location, `${LOCATION_INFO[level.location].name} · Level ${num}`, level.glasses, {
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

  const location = locationOfLevel(id);
  const ids = levelIds(location);
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
      onClose: () => void openLevelSelect(location),
    },
  );
}

// ---------------------------------------------------------------------------
// Mode Visite : Carte → Enter (ou ?visit=<lieu>). Le décor, la caméra libre, les 30 clients
// du lieu et leurs réactions, sans consommer l'essai du jour.
// ---------------------------------------------------------------------------
async function visitLocation(id: LocationId): Promise<void> {
  closeScreen();
  const info = LOCATION_INFO[id];
  const cast = rosterFor(id);
  let loc: LoadedLocation;
  try {
    loc = await loadLocation(game, id);
  } catch (err: unknown) {
    showFatalLoadError(`${info.name} didn't load`, err, {
      retry: () => visitLocation(id),
      map: true,
    });
    return;
  }
  frameGameplayCamera();
  fadeIn();
  loc.setChalkboard({ night: today?.night ?? 1, streak: player?.streak ?? 0, specials: info.specials });
  const counter = createCounter(loc);

  // Caméra libre mais bornée : on tourne autour du comptoir sans sortir du décor.
  const controls = new OrbitControls(game.camera, canvas);
  controls.target.set(0.02, 0.12, 0.4);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 0.7;
  controls.maxDistance = 1.8;
  controls.minAzimuthAngle = Math.PI - 0.75; // min > max : plage qui passe par ±π (derrière le comptoir)
  controls.maxAzimuthAngle = -Math.PI + 0.75;
  controls.minPolarAngle = 0.95;
  controls.maxPolarAngle = 1.75;
  controls.update();
  const stopControls = game.onTick(() => controls.update());

  let idleTimer = 0;
  const played = player?.playedToday ?? [];
  const allPlayed = played.length > 0 && played.every(Boolean);

  const leave = (): void => {
    clearTimeout(idleTimer);
    counter.dispose();
    panel.dispose();
    stopControls();
    controls.dispose();
    loc.dispose();
  };

  const real = isRealShift(id);
  const panel = showVisitPanel(
    {
      name: info.name,
      blurb: info.blurb,
      customers: cast.map((c) => ({ id: c.id, name: c.name, line: c.line })),
      hasLevels: levelIds(id).length > 0,
      real,
      shiftLabel: real
        ? allPlayed
          ? "▶ See Tonight's Results"
          : played.some(Boolean)
            ? "▶ Finish Tonight's Shift"
            : "▶ Play Tonight's Shift"
        : '▶ Free Play here',
      shiftNote: real
        ? 'The real game: 1 try per night, scored by the server, grows your 🔥 streak and counts for the leaderboard.'
        : `Unlimited replays, same rules. Doesn't change your 🔥 streak or the leaderboard (that's Tonight's Shift at the ${
            LOCATION_INFO[REAL_SHIFT_LOCATION].name
          }).`,
    },
    {
      onCustomer: (i) => {
        const c = cast[i]!;
        counter.show(c);
        counter.say(c.name, c.line, 3);
        // le suivant est déjà téléchargé quand on appuie sur ›
        preload([`/assets/models/char_${cast[(i + 1) % cast.length]!.id}.glb`]);
      },
      onReact: (kind) => {
        counter.react(kind === 'happy' ? { score: 100, overflow: false } : kind === 'meh' ? { score: 60, overflow: false } : { score: 0, overflow: true });
        clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => counter.idle(), 2200);
      },
      onPlayShift: () => {
        const night = today;
        void fadeOut().then(() => {
          leave();
          if (real && night) playTonight(night).catch((err: unknown) => console.error('[aguamesa] playTonight:', err));
          else playFreePlay(id).catch((err: unknown) => console.error('[aguamesa] free play:', err));
        });
      },
      onLevels: () => {
        leave();
        openLevelSelect(id).catch((err: unknown) => console.error('[aguamesa] levels:', err));
      },
      onBack: () => {
        void fadeOut().then(() => {
          leave();
          openMap();
          fadeIn();
        });
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Carte de l'île : les 6 lieux. Toucher un lieu → la caméra y vole → « Enter » → Visite.
// ---------------------------------------------------------------------------
function openMap(): void {
  closeScreen();
  let backBtn: HTMLButtonElement | null = null;
  let mapRef: { dispose(): void } | null = null;
  const enter = async (id: LocationId): Promise<void> => {
    try {
      await fadeOut();
      mapRef?.dispose();
      backBtn?.remove();
      await visitLocation(id);
    } catch (err: unknown) {
      // visitLocation already shows its own UI for load failures and returns;
      // this is the backstop for anything unexpected, so Enter can never trap
      // the user behind the fade with no way back.
      showFatalLoadError(`${LOCATION_INFO[id].name} didn't load`, err, {
        retry: () => enter(id),
        map: true,
      });
    }
  };
  const tags = Object.fromEntries(
    LOCATIONS.map((l) => [l, isRealShift(l) ? { label: "🔥 Tonight's Shift", real: true } : { label: 'Free play' }]),
  );
  void loadMap(
    game,
    new Set<LocationId>(LOCATIONS),
    (id) => {
      enter(id).catch((err: unknown) => console.error('[aguamesa] enter:', err));
    },
    tags,
  ).then((map) => {
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
  }).catch((err: unknown) => {
    showFatalLoadError("The island didn't load", err, { retry: () => openMap() });
  });
}

// ---------------------------------------------------------------------------
// Accueil
// ---------------------------------------------------------------------------
let firstBoot = true;
async function boot(): Promise<void> {
  closeScreen();
  const init = await gameApi.init();
  today = init.today;
  // Garde les étoiles gagnées pendant cette session si le serveur (ou le mock) répond avant.
  player = player ? { ...init.player, stars: { ...init.player.stars, ...player.stars } } : init.player;
  const me = player;
  const night = init.today;
  console.log(`[aguamesa] night #${night.night} (${night.dayId}), location ${night.location}, streak 🔥${me.streak}`);

  // Lien direct vers un lieu (équipe, jury) : ...?visit=castle
  if (firstBoot) {
    firstBoot = false;
    const direct = new URLSearchParams(window.location.search).get('visit');
    if (isLocation(direct)) {
      try {
        await visitLocation(direct);
      } catch (err: unknown) {
        showFatalLoadError(`${LOCATION_INFO[direct].name} didn't load`, err, {
          retry: () => visitLocation(direct),
          map: true,
        });
      }
      return;
    }
  }

  activeScreen = showHome(me, {
    onServir: () => {
      closeScreen();
      playTonight(night).catch((err: unknown) => console.error('[aguamesa] playTonight:', err));
    },
    onLevels: () => {
      openLevelSelect(isLocation(night.location) && LEVEL_LOCATIONS.includes(night.location) ? night.location : 'cafe').catch(
        (err: unknown) => console.error('[aguamesa] levels:', err),
      );
    },
    onCarte: () => openMap(),
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
  }, { shiftPlace: LOCATION_INFO[REAL_SHIFT_LOCATION].name });
}

boot().catch((err: unknown) => console.error('[aguamesa] boot:', err));

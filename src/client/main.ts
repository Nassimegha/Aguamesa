// Point d'entree TEMPORAIRE pour tester en local (npm run dev:local).
// Le vrai squelette (00 §4 : "main.ts : P3 (squelette), puis P2") n'existe pas encore.
// Sert a verifier les Taches 1, 2 et 3 (scene.ts, les 8 verres, loc_cafe.glb,
// les 3 clients animes) avant que le serveur Devvit existe.
import * as THREE from 'three';
import { createScene } from './world/scene';
import { loadLocation } from './world/location';
import { spawnCustomer, type CustomerId } from './world/customers';
import { loadMap } from './world/map';
import { createStreakBoard } from './world/streakBoard';
import { applyDecor } from './world/decor';
import { showHome } from './ui/home';
import { showNightResult } from './ui/nightResult';
import { showLeaderboard } from './ui/leaderboard';
import { showShelf } from './ui/shelf';
import type { PlayerState, NightSummary, LeaderboardRow } from '../shared/types';

const MOCK_PLAYER: PlayerState = {
  username: 'nassime', serverLevel: 12, streak: 12, bestStreak: 15, streakFreezes: 1,
  lastPlayedDayId: '2026-11-23', tips: 340, stars: { 'cafe-01': 3, 'cafe-02': 2 },
  collection: ['pint', 'thimble', 'mug_giant'], decor: ['lamp_warm'],
  playedToday: [false, false, false, false, false],
};

const MOCK_NIGHT: NightSummary = {
  dayId: '2026-11-24', scores: [98, 100, 71, 88, 94], total: 451, tips: 58, streak: 12,
  streakMilestone: 14, freezeUsed: true, rank: 7,
  shareText: '☕ Nuit #24 🍺98 🧚100 👻71 ⛵88 🧙94 = 451 · 🔥12',
};

const MOCK_LEADERBOARD: LeaderboardRow[] = [
  { rank: 1, username: 'mohamed', total: 486, streak: 21 },
  { rank: 2, username: 'marwa', total: 470, streak: 9 },
  { rank: 3, username: 'nassime', total: 451, streak: 12 },
];

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = createScene(canvas);

const ALL_GLASSES = ['pint', 'mug_giant', 'thimble', 'flute', 'coconut', 'teacup', 'goblet', 'tankard'] as const;

async function checkAllGlasses(): Promise<void> {
  const spacing = 0.16;
  const startX = -((ALL_GLASSES.length - 1) * spacing) / 2;
  for (let i = 0; i < ALL_GLASSES.length; i++) {
    const model = ALL_GLASSES[i];
    const glass = await game.loadGLB(`/assets/models/glass_${model}.glb`);
    glass.position.set(startX + i * spacing, 0, 0);
    game.scene.add(glass);
    for (const name of ['LIQUID_BOTTOM', 'LIQUID_TOP', 'LIQUID_SHAPE'] as const) {
      const found = glass.getObjectByName(name);
      console.log(found ? `✅ glass_${model}: ${name}` : `❌ glass_${model}: ${name} introuvable`);
    }
  }
  game.camera.position.set(0, 0.5, 0.75);
  game.camera.lookAt(0, 0.08, 0);
}

const CUSTOMER_SETS: Record<string, CustomerId[]> = {
  cafe: ['giant', 'fairy', 'ghost'],
  beach: ['surfer', 'crab_mister', 'mermaid'],
  chalet: ['yeti', 'skier', 'grandma_bear'],
};

async function checkCustomers(): Promise<void> {
  const set = new URLSearchParams(window.location.search).get('set') ?? 'cafe';
  const ids = CUSTOMER_SETS[set] ?? CUSTOMER_SETS['cafe']!;
  const spacing = 0.7;
  const startX = -((ids.length - 1) * spacing) / 2;
  const cycle: Array<'idle' | 'happy' | 'meh' | 'splashed'> = ['idle', 'happy', 'meh', 'splashed'];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const customer = await spawnCustomer(game, id, new THREE.Vector3(startX + i * spacing, 0, 0));
    console.log(`✅ char_${id} chargé, animations trouvées :`, customer.root.animations.map((a) => a.name));

    let step = 0;
    setInterval(() => {
      const name = cycle[step % cycle.length]!;
      step++;
      if (name === 'idle') customer.idle();
      else customer.reactTo({ score: name === 'happy' ? 99 : 50, overflow: name === 'splashed' });
      console.log(`char_${id} -> ${name}`);
    }, 2000 + i * 300);
  }

  game.camera.position.set(0, 0.5, 1.6);
  game.camera.lookAt(0, 0.25, 0);
}

async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);

  if (params.has('glasses')) {
    await checkAllGlasses();
    game.start();
    return;
  }
  if (params.has('customers')) {
    await checkCustomers();
    game.start();
    return;
  }
  if (params.has('map')) {
    const unlocked = new Set<'cafe' | 'beach' | 'chalet'>(['cafe', 'beach', 'chalet']);
    await loadMap(game, unlocked, (id) => console.log('✅ entrer dans', id));
    game.start();
    return;
  }
  const uiScreen = params.get('ui');
  if (uiScreen === 'home') {
    showHome(MOCK_PLAYER, {
      onServir: () => console.log('✅ onServir'),
      onLevels: () => console.log('✅ onLevels'),
      onCarte: () => console.log('✅ onCarte'),
      onClassement: () => console.log('✅ onClassement'),
      onEtagere: () => console.log('✅ onEtagere'),
    });
    return;
  }
  if (uiScreen === 'night') {
    showNightResult(MOCK_NIGHT, {
      onShare: () => console.log('✅ onShare', MOCK_NIGHT.shareText),
      onClose: () => console.log('✅ onClose'),
    });
    return;
  }
  if (uiScreen === 'leaderboard') {
    showLeaderboard(
      { day: MOCK_LEADERBOARD, all: MOCK_LEADERBOARD, currentUsername: 'nassime' },
      { onClose: () => console.log('✅ onClose') },
    );
    return;
  }
  if (uiScreen === 'shelf') {
    showShelf(MOCK_PLAYER.collection, { onClose: () => console.log('✅ onClose') });
    return;
  }

  const locParam = (params.get('loc') as 'cafe' | 'beach' | 'chalet' | null) ?? 'cafe';
  const loc = await loadLocation(game, locParam);
  const glass = await game.loadGLB('/assets/models/glass_pint.glb');
  loc.placeGlass(glass);
  game.scene.add(glass);

  if (params.has('board')) {
    const board = createStreakBoard(game);
    board.setStreak(Number(params.get('board')) || 12);
  }
  if (params.has('decor')) {
    applyDecor(game, params.get('decor')!.split(','));
  }

  for (const name of ['LIQUID_BOTTOM', 'LIQUID_TOP', 'LIQUID_SHAPE'] as const) {
    const found = glass.getObjectByName(name);
    console.log(found ? `✅ ${name} trouvé` : `❌ ${name} introuvable`);
  }
  for (const name of ['GLASS_ANCHOR', 'CAMERA_POS', 'CAMERA_TARGET'] as const) {
    const found = loc.decor.getObjectByName(name);
    console.log(found ? `✅ loc_cafe: ${name} trouvé` : `❌ loc_cafe: ${name} introuvable`);
  }

  // DEBUG TEMPORAIRE : plan large pour voir tout le décor d'un coup (?debug=1).
  if (params.has('debug')) {
    game.camera.position.set(1.3, 1.3, -2.1);
    game.camera.lookAt(new THREE.Vector3(0, 0.5, 0.4));
  }

  if (params.has('fps')) {
    let frames = 0;
    const t0 = performance.now();
    const stop = game.onTick(() => {
      frames++;
    });
    setTimeout(() => {
      stop();
      const seconds = (performance.now() - t0) / 1000;
      console.log(`FPS_REPORT ${(frames / seconds).toFixed(1)} fps sur ${seconds.toFixed(1)}s (${frames} frames)`);
    }, 4000);
  }

  game.start();
}

main().catch((err) => console.error('Échec du chargement de la scène :', err));

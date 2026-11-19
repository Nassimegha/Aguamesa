// src/client/game.ts — point d'entrée réel du jeu (remplace la démo Three.js du modèle).
// Branche : le monde 3D de P2 (world/*), le moteur de jeu de P1 (game/*), le serveur
// de P3 (api.ts / mockApi.ts), sur le parcours du Service du Jour (00 §2, les 7 étapes).
import * as THREE from 'three';
import { api, type GameApi } from './api';
import { mockApi } from './mockApi';
import { createScene } from './world/scene';
import { loadLocation } from './world/location';
import { spawnCustomer, type Customer, type CustomerId } from './world/customers';
import { loadMap } from './world/map';
import { showHome } from './ui/home';
import { showNightResult } from './ui/nightResult';
import { showLeaderboard } from './ui/leaderboard';
import { showShelf } from './ui/shelf';
import type { Screen } from './ui/screen';
import { createGlassStage } from './game/glassStage';
import { playNight } from './game/round';
import { createGameAudio } from './game/audio';
import type { DailyService } from '../shared/types';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const gameApi: GameApi = isLocal ? mockApi : api;

const KNOWN_CUSTOMERS: ReadonlySet<CustomerId> = new Set([
  'giant', 'fairy', 'ghost', 'surfer', 'crab_mister', 'mermaid', 'yeti', 'skier', 'grandma_bear',
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
};

const canvas = document.getElementById('bg') as HTMLCanvasElement;
const game = createScene(canvas);
game.start();

let activeScreen: Screen | null = null;
function closeScreen(): void {
  activeScreen?.unmount();
  activeScreen = null;
}

async function playTonight(today: DailyService): Promise<void> {
  const locationId = KNOWN_LOCATIONS.has(today.location) ? (today.location as 'cafe' | 'beach' | 'chalet') : 'cafe';
  if (locationId !== today.location) {
    console.warn(`[aguamesa] lieu "${today.location}" pas encore construit, cafe par defaut`);
  }

  const loc = await loadLocation(game, locationId);
  // La caméra du lieu montre tout le décor ; pour verser, on se rapproche du verre
  // (sinon il fait quelques pixels sur un téléphone).
  game.camera.position.set(0, 0.3, -0.5);
  game.camera.lookAt(0.08, 0.12, 0.3);
  const sound = createGameAudio();
  const stage = createGlassStage({
    game,
    inputElement: canvas,
    placeGlass: (root) => loc.placeGlass(root),
    sound,
  });

  let activeCustomer: Customer | null = null;
  // Un client se charge en différé : s'il arrive après le verre suivant (ou la fin de
  // la nuit), on le jette au lieu de l'afficher en double.
  let customerToken = 0;

  await playNight({
    today,
    api: gameApi,
    playGlass: stage.playGlass,
    events: {
      onGlassStart: (_index, spec) => {
        const token = ++customerToken;
        activeCustomer?.dispose();
        activeCustomer = null;
        const id = spec.customer as CustomerId;
        if (!KNOWN_CUSTOMERS.has(id)) {
          console.warn(`[aguamesa] client "${spec.customer}" pas encore construit, verre sans client`);
          return;
        }
        spawnCustomer(game, id, CUSTOMER_SPOT[id].clone())
          .then((c) => {
            if (token !== customerToken) c.dispose();
            else activeCustomer = c;
          })
          .catch((err: unknown) => console.error('spawnCustomer:', err));
      },
      onPourEnd: (_index, outcome) => activeCustomer?.reactTo(outcome),
      onServerResult: (index, result) => stage.showCrowd(index, result),
      onGlassSkipped: (index) => console.log(`[aguamesa] verre ${index + 1} deja joue aujourd'hui`),
      onError: (err) => console.error('[aguamesa] nuit:', err),
      onNightEnd: (summary) => {
        customerToken++;
        activeCustomer?.dispose();
        activeCustomer = null;
        stage.clear();
        sound.dispose();
        loc.dispose();
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

async function boot(): Promise<void> {
  closeScreen();
  const { player, today } = await gameApi.init();
  console.log(`[aguamesa] nuit #${today.night} (${today.dayId}), lieu ${today.location}, streak 🔥${player.streak}`);

  activeScreen = showHome(player, {
    onServir: () => {
      closeScreen();
      playTonight(today).catch((err: unknown) => console.error('[aguamesa] playTonight:', err));
    },
    onCarte: () => {
      closeScreen();
      const unlocked = new Set<'cafe' | 'beach' | 'chalet'>(['cafe', 'beach', 'chalet']);
      void loadMap(game, unlocked, (id) => console.log('[aguamesa] carte: entrer dans', id)).then((map) => {
        const backBtn = document.createElement('button');
        backBtn.className = 'btn btn--icon btn--ghost';
        backBtn.textContent = '←';
        backBtn.style.cssText = 'position:fixed;top:max(16px,env(safe-area-inset-top));left:16px;z-index:20;';
        backBtn.addEventListener('click', () => {
          map.dispose();
          backBtn.remove();
          void boot();
        });
        document.body.appendChild(backBtn);
      });
    },
    onClassement: () => {
      closeScreen();
      void gameApi.leaderboard('day').then((day) => {
        void gameApi.leaderboard('all').then((all) => {
          activeScreen = showLeaderboard(
            { day, all, currentUsername: player.username },
            { onClose: () => void boot() },
          );
        });
      });
    },
    onEtagere: () => {
      closeScreen();
      activeScreen = showShelf(player.collection, { onClose: () => void boot() });
    },
  });
}

boot().catch((err: unknown) => console.error('[aguamesa] boot:', err));

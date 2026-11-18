// P2 (Nassime) : la carte de l'île, choix du lieu, lieux verrouillés.
// Reprend les positions de blender/map-viewer/map_meta.json (même island.glb,
// même repère). On touche un lieu pour y entrer ; les lieux verrouillés
// affichent un cadenas et « Bientôt » (brief 02 Tâche 4).
import * as THREE from 'three';
import type { GameScene } from './scene';
import type { LocationId } from './location';

interface MapLocationMeta {
  id: number;
  key: LocationId;
  name: string;
  pin: [number, number, number];
  camPos: [number, number, number];
  camTarget: [number, number, number];
}

// Positions reprises de blender/map-viewer/map_meta.json (généré par build_map.py).
const LOCATIONS: MapLocationMeta[] = [
  { id: 1, key: 'cafe', name: 'Café de Minuit', pin: [-3.61, 12.036, 20.475], camPos: [-7.82, 17.236, -7.481], camTarget: [-3.61, 6.836, 20.475] },
  { id: 2, key: 'beach', name: 'La Plage', pin: [32.217, 8.44, 27.033], camPos: [58.302, 13.69, 37.173], camTarget: [32.217, 3.565, 27.033] },
  { id: 3, key: 'chalet', name: 'Le Chalet', pin: [23.997, 21.267, -13.854], camPos: [44.032, 22.267, -31.703], camTarget: [20.135, 20.228, -12.81] },
  { id: 4, key: 'fair', name: 'La Fête foraine', pin: [-4.371, 20.867, -24.791], camPos: [9.979, 25.267, 4.766], camTarget: [-4.371, 10.467, -24.791] },
  { id: 5, key: 'pirate', name: 'Le Bateau pirate', pin: [-52.73, 15.1, -22.827], camPos: [-76.849, 14.1, -24.326], camTarget: [-52.73, 5.1, -22.827] },
  { id: 6, key: 'castle', name: 'Le Château hanté', pin: [-40.21, 28.956, 26.112], camPos: [-17.1, 33.056, 0.373], camTarget: [-40.21, 16.606, 26.112] },
];

const PLAYABLE_IN_HACKATHON: ReadonlySet<LocationId> = new Set(['cafe', 'beach', 'chalet']);

export interface MapPin {
  readonly meta: MapLocationMeta;
  readonly unlocked: boolean;
  readonly el: HTMLButtonElement;
}

export interface GameMap {
  readonly island: THREE.Object3D;
  dispose(): void;
}

export async function loadMap(
  game: GameScene,
  unlockedLocations: ReadonlySet<LocationId>,
  onEnter: (id: LocationId) => void,
): Promise<GameMap> {
  const island = await game.loadGLB('/assets/models/island.glb');
  game.scene.add(island);

  const overlay = document.createElement('div');
  overlay.className = 'map-pins';
  document.body.appendChild(overlay);

  const pins: MapPin[] = LOCATIONS.map((meta) => {
    const unlocked = unlockedLocations.has(meta.key);
    const el = document.createElement('button');
    el.className = `map-pin${unlocked ? '' : ' map-pin--locked'}`;
    el.innerHTML = unlocked
      ? `<span class="map-pin__num">${meta.id}</span><span class="map-pin__name">${meta.name}</span>`
      : `<span class="map-pin__num">🔒</span><span class="map-pin__name">${meta.name}<small>Bientôt</small></span>`;
    el.disabled = !unlocked;
    if (unlocked) {
      el.addEventListener('click', () => {
        flyTo(meta);
        onEnter(meta.key);
      });
    }
    overlay.appendChild(el);
    return { meta, unlocked, el };
  });

  // Vue d'ensemble de départ : toute l'île fait ~240 unités de large.
  game.camera.far = 1000;
  game.camera.updateProjectionMatrix();
  game.camera.position.set(-90, 140, 160);
  game.camera.lookAt(0, 5, 0);

  let flight: { from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; t: number } | null = null;

  function flyTo(meta: MapLocationMeta): void {
    flight = {
      from: game.camera.position.clone(),
      to: new THREE.Vector3(...meta.camPos),
      fromTarget: currentTarget.clone(),
      toTarget: new THREE.Vector3(...meta.camTarget),
      t: 0,
    };
  }

  const currentTarget = new THREE.Vector3(0, 5, 0);
  const projected = new THREE.Vector3();

  function updatePins(): void {
    const canvas = game.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    for (const pin of pins) {
      projected.set(...pin.meta.pin).project(game.camera);
      const behind = projected.z > 1;
      const x = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
      const y = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
      pin.el.style.transform = `translate(${x}px, ${y}px)`;
      pin.el.style.display = behind ? 'none' : 'flex';
    }
  }

  const unsubscribe = game.onTick((deltaSeconds) => {
    if (flight) {
      flight.t = Math.min(1, flight.t + deltaSeconds / 1.6);
      const e = easeInOut(flight.t);
      game.camera.position.lerpVectors(flight.from, flight.to, e);
      currentTarget.lerpVectors(flight.fromTarget, flight.toTarget, e);
      game.camera.lookAt(currentTarget);
      if (flight.t >= 1) flight = null;
    }
    updatePins();
  });
  updatePins();

  function dispose(): void {
    unsubscribe();
    overlay.remove();
    game.scene.remove(island);
  }

  return { island, dispose };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export { PLAYABLE_IN_HACKATHON, LOCATIONS as MAP_LOCATIONS };

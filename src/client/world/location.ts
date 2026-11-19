// P2 (Nassime) : decor du comptoir pour chaque lieu.
// Chaque loc_<location>.glb porte 3 marqueurs (meme convention que les empties
// LIQUID_* des verres, contrat 00 §6.3) :
//   GLASS_ANCHOR   - ou poser le verre actif
//   CAMERA_POS     - position de la camera pour ce lieu
//   CAMERA_TARGET  - point regarde par la camera
// Marqueurs optionnels (loc_cafe v2) :
//   UI_DIALOGUE_ANCHOR - au-dessus de la tete du client (bulle de dialogue HTML)
//   UI_STREAK_ANCHOR   - sur l'ardoise
//   CHALKBOARD         - mesh repeint ici (plats du jour + serie)
//   CANDLE_FLAME_n     - flammes qui vacillent
import * as THREE from 'three';
import type { GameScene } from './scene';

// TEMPORAIRE : src/shared/types.ts n'existe pas encore (c'est le fichier de P3,
// 00 §6.1). Des que Mohamed le commite, remplacer cette ligne par :
//   import type { LocationId } from '../../shared/types';
export type LocationId = 'cafe' | 'beach' | 'chalet' | 'fair' | 'pirate' | 'castle';

const LOCATION_GLB: Record<LocationId, string> = {
  cafe: '/assets/models/loc_cafe.glb',
  beach: '/assets/models/loc_beach.glb',
  chalet: '/assets/models/loc_chalet.glb',
  fair: '/assets/models/loc_fair.glb',
  pirate: '/assets/models/loc_pirate.glb',
  castle: '/assets/models/loc_castle.glb',
};

export interface ChalkboardInfo {
  night: number;
  streak: number;
  specials: string[];
}

export interface LoadedLocation {
  readonly decor: THREE.Group;
  readonly glassAnchor: THREE.Object3D;
  /** null if the location has no such marker. */
  readonly dialogueAnchor: THREE.Object3D | null;
  readonly streakAnchor: THREE.Object3D | null;
  placeGlass(glass: THREE.Object3D): void;
  /** Paints the chalkboard (no-op if the location has none). */
  setChalkboard(info: ChalkboardInfo): void;
  dispose(): void;
}

function paintChalkboard(info: ChalkboardInfo): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 420;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1e2a26';
  g.fillRect(0, 0, c.width, c.height);
  // chalk dust smudges
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(240,236,220,${0.02 + Math.random() * 0.03})`;
    g.beginPath();
    g.ellipse(Math.random() * 512, Math.random() * 420, 30 + Math.random() * 60, 10 + Math.random() * 20, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#f3ecd0';
  g.textAlign = 'center';
  g.font = '700 44px "Trebuchet MS", sans-serif';
  g.fillText("TONIGHT'S SPECIALS", 256, 66);
  g.fillStyle = '#e0a93c';
  g.font = '600 26px "Trebuchet MS", sans-serif';
  g.fillText(`Night #${info.night}`, 256, 104);
  g.fillStyle = '#f3ecd0';
  g.font = '28px "Trebuchet MS", sans-serif';
  info.specials.slice(0, 4).forEach((s, i) => g.fillText(`~ ${s} ~`, 256, 158 + i * 42));
  // streak tally marks (00 §1: "des traits a la craie sur l'ardoise")
  g.fillStyle = '#ffb45a';
  g.font = '700 34px "Trebuchet MS", sans-serif';
  g.fillText(`🔥 ${info.streak}`, 256, 350);
  g.strokeStyle = 'rgba(243,236,208,0.85)';
  g.lineWidth = 4;
  const marks = Math.min(info.streak, 20);
  for (let i = 0; i < marks; i++) {
    const group = Math.floor(i / 5);
    const x = 256 - 120 + group * 64 + (i % 5) * 10;
    g.beginPath();
    if (i % 5 === 4) {
      g.moveTo(x - 44, 400);
      g.lineTo(x + 2, 376);
    } else {
      g.moveTo(x, 372);
      g.lineTo(x + 2, 404);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export async function loadLocation(game: GameScene, location: LocationId): Promise<LoadedLocation> {
  const url = LOCATION_GLB[location];
  const decor = await game.loadGLB(url);
  game.scene.add(decor);

  const glassAnchor = decor.getObjectByName('GLASS_ANCHOR');
  const cameraPos = decor.getObjectByName('CAMERA_POS');
  const cameraTarget = decor.getObjectByName('CAMERA_TARGET');
  if (!glassAnchor || !cameraPos || !cameraTarget) {
    throw new Error(`loc_${location}.glb : marqueurs manquants (GLASS_ANCHOR/CAMERA_POS/CAMERA_TARGET)`);
  }

  game.camera.position.copy(cameraPos.getWorldPosition(new THREE.Vector3()));
  game.camera.lookAt(cameraTarget.getWorldPosition(new THREE.Vector3()));

  // flammes de bougie : vacillement leger (echelle + intensite emissive)
  const flames: { o: THREE.Mesh; ph: number; base: THREE.Vector3 }[] = [];
  decor.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name.startsWith('CANDLE_FLAME')) {
      flames.push({ o, ph: Math.random() * 10, base: o.scale.clone() });
    }
  });
  let time = 0;
  const stopTick = flames.length
    ? game.onTick((dt) => {
        time += dt;
        for (const f of flames) {
          const n = 0.85 + 0.15 * Math.sin(time * 13 + f.ph) * Math.sin(time * 7.3 + f.ph * 2);
          f.o.scale.set(f.base.x * (0.95 + 0.05 * n), f.base.y * n, f.base.z * (0.9 + 0.2 * n));
          const m = f.o.material as THREE.MeshStandardMaterial;
          if (m.emissive) m.emissiveIntensity = 6 + 3 * n;
        }
      })
    : (): void => {};

  const board = decor.getObjectByName('CHALKBOARD') as THREE.Mesh | undefined;
  let boardTex: THREE.CanvasTexture | null = null;

  function setChalkboard(info: ChalkboardInfo): void {
    if (!board) return;
    boardTex?.dispose();
    boardTex = paintChalkboard(info);
    board.material = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.95, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.12 });
  }

  function placeGlass(glass: THREE.Object3D): void {
    glass.position.copy(glassAnchor!.getWorldPosition(new THREE.Vector3()));
  }

  function dispose(): void {
    stopTick();
    boardTex?.dispose();
    game.scene.remove(decor);
  }

  return {
    decor,
    glassAnchor,
    dialogueAnchor: decor.getObjectByName('UI_DIALOGUE_ANCHOR') ?? null,
    streakAnchor: decor.getObjectByName('UI_STREAK_ANCHOR') ?? null,
    placeGlass,
    setChalkboard,
    dispose,
  };
}

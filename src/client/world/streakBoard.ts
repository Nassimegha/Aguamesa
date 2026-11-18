// P2 (Nassime) : l'ardoise de la série derrière le comptoir (brief 02 Tâche 5
// bis §4) — sur le mur du fond, visible depuis la caméra de jeu, à côté des
// étagères. Plutôt que d'ajouter un marqueur dans chaque loc_<lieu>.glb, elle
// se positionne à un offset fixe (même géométrie de mur dans les 3 décors),
// donc aucun changement côté Blender n'est nécessaire.
import * as THREE from 'three';
import type { GameScene } from './scene';

const BOARD_OFFSET = new THREE.Vector3(0.75, 0.52, 0.86);
const BOARD_WIDTH = 0.26;
const BOARD_HEIGHT = 0.16;
const TEXTURE_SIZE = 256;

export interface StreakBoard {
  readonly mesh: THREE.Mesh;
  setStreak(nights: number): void;
  dispose(): void;
}

export function createStreakBoard(game: GameScene): StreakBoard {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = Math.round((TEXTURE_SIZE * BOARD_HEIGHT) / BOARD_WIDTH);
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const geometry = new THREE.PlaneGeometry(BOARD_WIDTH, BOARD_HEIGHT);
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(BOARD_OFFSET);
  game.scene.add(mesh);

  function draw(nights: number): void {
    const { width, height } = canvas;
    ctx.fillStyle = '#2f3b36';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(2, width * 0.012);
    ctx.lineCap = 'round';

    const groupSize = 5;
    const groups = Math.ceil(nights / groupSize);
    const padding = width * 0.06;
    const groupGap = width * 0.05;
    const usableWidth = width - padding * 2;
    const groupWidth = Math.min(width * 0.16, usableWidth / Math.max(1, groups));
    const tickGap = groupWidth / (groupSize - 0.3);

    let remaining = nights;
    for (let g = 0; g < groups; g++) {
      const count = Math.min(groupSize, remaining);
      remaining -= count;
      const gx = padding + g * (groupWidth + groupGap);
      for (let i = 0; i < Math.min(count, 4); i++) {
        const x = gx + i * tickGap;
        ctx.beginPath();
        ctx.moveTo(x, height * 0.2);
        ctx.lineTo(x, height * 0.8);
        ctx.stroke();
      }
      if (count === 5) {
        // le 5e trait barre les 4 autres en diagonale
        ctx.beginPath();
        ctx.moveTo(gx - tickGap * 0.2, height * 0.78);
        ctx.lineTo(gx + tickGap * 3.2, height * 0.22);
        ctx.stroke();
      }
    }
    texture.needsUpdate = true;
  }

  draw(0);

  function setStreak(nights: number): void {
    draw(Math.max(0, nights));
  }

  function dispose(): void {
    game.scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }

  return { mesh, setStreak, dispose };
}

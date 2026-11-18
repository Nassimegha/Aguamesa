// P2 (Nassime) : la déco du café achetée avec les pourboires (brief 02 Tâche 6).
// Chaque entrée de PlayerState.decor (contrat 00 §6.1) ajoute un petit objet
// dans la scène. Géométrie procédurale directe (pas de nouveau .glb) : ce sont
// de petits accessoires, inutile de repasser par Blender pour chacun.
import * as THREE from 'three';
import type { GameScene } from './scene';

export type DecorId = 'lamp_warm' | 'plant_1' | 'cat_bed' | 'garland_lights';

type DecorBuilder = () => THREE.Object3D;

function material(color: number, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    emissive: emissive ? color : 0x000000,
    emissiveIntensity: emissive,
  });
}

const DECOR_CATALOG: Record<DecorId, DecorBuilder> = {
  lamp_warm: () => {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.06, 10), material(0x5a3d2a));
    base.position.y = 0.03;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.05, 10, 1, true), material(0xe0a93c, 0.6));
    shade.position.y = 0.08;
    const light = new THREE.PointLight(0xffb066, 1.2, 0.5, 2);
    light.position.y = 0.08;
    group.add(base, shade, light);
    group.position.set(0.5, -0.02, 0.1);
    return group;
  },

  plant_1: () => {
    const group = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.05, 10), material(0xa8703f));
    pot.position.y = 0.025;
    const leaves = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 6), material(0x4e8f5f));
      const angle = (i / 5) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 0.015, 0.09, Math.sin(angle) * 0.015);
      leaf.rotation.z = Math.cos(angle) * 0.3;
      leaf.rotation.x = Math.sin(angle) * 0.3;
      leaves.add(leaf);
    }
    group.add(pot, leaves);
    group.position.set(-0.58, -0.02, 0.15);
    return group;
  },

  cat_bed: () => {
    const group = new THREE.Group();
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), material(0x8c58c8));
    cushion.position.y = 0.01;
    group.add(cushion);
    group.position.set(0.55, -0.02, -0.1);
    return group;
  },

  garland_lights: () => {
    const group = new THREE.Group();
    const count = 8;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.008, 8, 6),
        material([0xffd27a, 0xe0703c, 0x4fb0a8][i % 3]!, 1.2),
      );
      bulb.position.set(-0.6 + t * 1.2, Math.sin(t * Math.PI) * -0.04, 0.32);
      group.add(bulb);
    }
    return group;
  },
};

export interface DecorSet {
  dispose(): void;
}

export function applyDecor(game: GameScene, decorIds: readonly string[]): DecorSet {
  const added: THREE.Object3D[] = [];
  for (const id of decorIds) {
    const builder = DECOR_CATALOG[id as DecorId];
    if (!builder) {
      console.warn(`decor.ts : "${id}" n'est pas dans le catalogue, ignoré`);
      continue;
    }
    const obj = builder();
    game.scene.add(obj);
    added.push(obj);
  }

  function dispose(): void {
    for (const obj of added) game.scene.remove(obj);
  }

  return { dispose };
}

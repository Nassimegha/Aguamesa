// P2 (Nassime) : decor du comptoir pour chaque lieu.
// Chaque loc_<location>.glb porte 3 marqueurs (meme convention que les empties
// LIQUID_* des verres, contrat 00 §6.3) :
//   GLASS_ANCHOR   - ou poser le verre actif
//   CAMERA_POS     - position de la camera pour ce lieu
//   CAMERA_TARGET  - point regarde par la camera
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

export interface LoadedLocation {
  readonly decor: THREE.Group;
  readonly glassAnchor: THREE.Object3D;
  placeGlass(glass: THREE.Object3D): void;
  dispose(): void;
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

  function placeGlass(glass: THREE.Object3D): void {
    glass.position.copy(glassAnchor!.getWorldPosition(new THREE.Vector3()));
  }

  function dispose(): void {
    game.scene.remove(decor);
  }

  return { decor, glassAnchor, placeGlass, dispose };
}

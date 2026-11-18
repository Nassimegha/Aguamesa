// Point d'entree TEMPORAIRE pour tester en local (npm run dev:local).
// Le vrai squelette (00 §4 : "main.ts : P3 (squelette), puis P2") n'existe pas encore.
// Sert a verifier les Taches 1 et 2 (scene.ts, glass_pint.glb, loc_cafe.glb) avant
// que le serveur Devvit existe.
import { createScene } from './world/scene';
import { loadLocation } from './world/location';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = createScene(canvas);

async function main(): Promise<void> {
  const location = await loadLocation(game, 'cafe');

  const glass = await game.loadGLB('/assets/models/glass_pint.glb');
  location.placeGlass(glass);
  game.scene.add(glass);

  for (const name of ['LIQUID_BOTTOM', 'LIQUID_TOP', 'LIQUID_SHAPE'] as const) {
    const found = glass.getObjectByName(name);
    console.log(found ? `✅ ${name} trouvé` : `❌ ${name} introuvable`);
  }
  for (const name of ['GLASS_ANCHOR', 'CAMERA_POS', 'CAMERA_TARGET'] as const) {
    const found = location.decor.getObjectByName(name);
    console.log(found ? `✅ loc_cafe: ${name} trouvé` : `❌ loc_cafe: ${name} introuvable`);
  }

  // DEBUG TEMPORAIRE : plan large pour voir tout le décor d'un coup.
  if (new URLSearchParams(window.location.search).has('debug')) {
    game.camera.position.set(1.3, 1.3, -2.1);
    game.camera.lookAt(0, 0.5, 0.4);
  }

  game.start();
}

main().catch((err) => console.error('Échec du chargement de la scène :', err));

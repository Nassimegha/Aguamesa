// Point d'entrée TEMPORAIRE pour tester en local (npm run dev:local).
// Le vrai squelette (00 §4 : "main.ts : P3 (squelette), puis P2") n'existe pas encore.
// Ce fichier sera remplacé par celui de P3 ; il sert seulement à vérifier la Tâche 1
// (scene.ts + glass_pint.glb) avant que le serveur Devvit existe.
import { createScene } from './world/scene';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = createScene(canvas);

const GLASS_URL = '/assets/models/glass_pint.glb';

async function main(): Promise<void> {
  const glass = await game.loadGLB(GLASS_URL);
  game.scene.add(glass);

  // Critère d'acceptation de la Tâche 1 : les 3 objets sont trouvables par leur nom.
  for (const name of ['LIQUID_BOTTOM', 'LIQUID_TOP', 'LIQUID_SHAPE'] as const) {
    const found = glass.getObjectByName(name);
    console.log(found ? `✅ ${name} trouvé à` : `❌ ${name} introuvable`, found?.position);
  }

  game.start((deltaSeconds) => {
    glass.rotation.y += deltaSeconds * 0.4;
  });
}

main().catch((err) => console.error('Échec du chargement de glass_pint.glb :', err));

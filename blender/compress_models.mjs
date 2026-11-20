// Compresse tous les *_raw.glb d'un dossier (weld + meshopt) vers ../assets/models.
// Usage (depuis blender/) :
//   node compress_models.mjs _chars        # les 180 clients de build_customers.py
//   node compress_models.mjs .             # les loc_<lieu>_raw.glb de build_loc_*.py
// char_x_raw.glb -> ../assets/models/char_x.glb. Utilise la CLI officielle gltf-transform
// (téléchargée par npx au premier lancement) : jamais `optimize`, qui supprime les empties.
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const inDir = resolve(process.argv[2] ?? '_chars');
const outDir = resolve(import.meta.dirname, '..', 'assets', 'models');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const files = readdirSync(inDir).filter((f) => f.endsWith('_raw.glb')).sort();

for (const [i, f] of files.entries()) {
  const raw = join(inDir, f);
  const weld = raw.replace('_raw.glb', '_weld.glb');
  const out = join(outDir, f.replace('_raw.glb', '.glb'));
  const run = (args) => execFileSync(npx, ['--yes', '@gltf-transform/cli', ...args], { stdio: 'ignore', shell: process.platform === 'win32' });
  run(['weld', raw, weld]);
  run(['meshopt', weld, out, '--level', 'medium']);
  rmSync(weld);
  console.log(`[${i + 1}/${files.length}] ${f} -> ${out}`);
}

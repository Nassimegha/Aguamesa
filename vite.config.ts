import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { devvit } from '@devvit/start/vite';

// Vite n'embarque que public/. Les .glb et les données de la carte vivent dans
// assets/ (P2) et sont chargés à l'URL /assets/... : on copie le dossier dans le build client.
// Copie INCRÉMENTALE : seuls les fichiers nouveaux ou modifiés sont recopiés. Recopier les
// ~200 .glb à chaque rebuild faisait planter l'observateur de fichiers de `devvit playtest`
// sous Windows (EPERM sur un fichier remplacé pendant qu'il était surveillé).
function syncDir(src: string, dst: string): number {
  let copied = 0;
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) {
      copied += syncDir(from, to);
      continue;
    }
    const s = statSync(from);
    if (existsSync(to)) {
      const d = statSync(to);
      if (d.size === s.size && d.mtimeMs >= s.mtimeMs) continue;
    }
    copyFileSync(from, to);
    copied++;
  }
  return copied;
}

function copyAssets(): Plugin {
  return {
    name: 'aguamesa-copy-assets',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir ?? '';
      if (!outDir.replace(/\\/g, '/').endsWith('dist/client')) return;
      // Un dossier qui échoue (fichier verrouillé sous Windows) ne doit pas empêcher l'autre.
      for (const sub of ['map', 'models']) {
        const src = resolve(import.meta.dirname, 'assets', sub);
        if (!existsSync(src)) continue;
        try {
          syncDir(src, resolve(outDir, 'assets', sub));
        } catch (err) {
          console.error(`[aguamesa-copy-assets] assets/${sub}:`, err);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [devvit(), copyAssets()],
});

import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { devvit } from '@devvit/start/vite';

// Vite n'embarque que public/. Les .glb et les données de la carte vivent dans
// assets/ (P2) et sont chargés à l'URL /assets/... : on copie le dossier dans le build client.
function copyAssets(): Plugin {
  return {
    name: 'aguamesa-copy-assets',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir ?? '';
      if (!outDir.replace(/\\/g, '/').endsWith('dist/client')) return;
      for (const sub of ['models', 'map']) {
        const src = resolve(import.meta.dirname, 'assets', sub);
        if (existsSync(src)) cpSync(src, resolve(outDir, 'assets', sub), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [devvit(), copyAssets()],
});

import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { devvit } from '@devvit/start/vite';

// Vite n'embarque que public/. Les .glb vivent dans assets/models (P2) et sont
// chargés à l'URL /assets/models/... : on les copie dans le build client.
function copyModels(): Plugin {
  return {
    name: 'aguamesa-copy-models',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir ?? '';
      if (!outDir.replace(/\\/g, '/').endsWith('dist/client')) return;
      const src = resolve(import.meta.dirname, 'assets/models');
      if (existsSync(src)) cpSync(src, resolve(outDir, 'assets/models'), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [devvit(), copyModels()],
});

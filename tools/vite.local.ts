// tools/vite.local.ts — P3 (Task 1 fix + Task 2)
// Config for `npm run dev:local`: serves src/client WITHOUT the Devvit
// plugin (which only supports `vite build` and throws on `vite dev`).
// game.ts detects localhost and uses mockApi.ts (§10 examples) instead of
// the real /api, so P1/P2 can work with no Reddit connection.
//
// Serves:  http://localhost:5173/game.html   (game entrypoint)
//          http://localhost:5173/splash.html (splash entrypoint)
import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(toolsDir, '../src/client'),
  publicDir: resolve(toolsDir, '../public'),
  server: {
    open: '/game.html',
  },
  build: {
    rollupOptions: {
      input: {
        game: resolve(toolsDir, '../src/client/game.html'),
        splash: resolve(toolsDir, '../src/client/splash.html'),
      },
    },
  },
});

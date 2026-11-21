// tools/vite.local.ts — P3 (Task 1 fix + Task 2)
// Config for `npm run dev:local`: serves src/client WITHOUT the Devvit
// plugin (which only supports `vite build` and throws on `vite dev`).
// game.ts detects localhost and uses mockApi.ts (§10 examples) instead of
// the real /api, so P1/P2 can work with no Reddit connection.
//
// Serves:  http://localhost:5173/game.html   (game entrypoint)
//          http://localhost:5173/splash.html (splash entrypoint)
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(toolsDir, '../assets');

const CONTENT_TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
  '.basis': 'image/basis',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

// Dev-only: serve repo-root assets/ at /assets/* (production gets them via
// copyAssets() in vite.config.ts at build time). No symlink, no copy into
// public/ — this middleware only runs under `vite --config tools/vite.local.ts`.
function serveRepoAssets(): Plugin {
  return {
    name: 'aguamesa-serve-repo-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        try {
          const url = req.url ?? '';
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          if (!url.startsWith('/assets/')) return next();
          const rel = decodeURIComponent(url.split('?', 1)[0]!.slice('/assets/'.length));
          if (!rel || rel.includes('\0')) return next();
          const file = resolve(assetsDir, rel);
          if (file !== assetsDir && !file.startsWith(assetsDir + sep)) return next();
          if (!existsSync(file)) return next();
          if (!statSync(file).isFile()) return next();
          res.setHeader('Content-Type', CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          if (req.method === 'HEAD') {
            res.setHeader('Content-Length', String(statSync(file).size));
            res.end();
            return;
          }
          createReadStream(file).on('error', next).pipe(res);
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  root: resolve(toolsDir, '../src/client'),
  publicDir: resolve(toolsDir, '../public'),
  plugins: [serveRepoAssets()],
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

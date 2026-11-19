// tools/test-hooks.mjs — P3 (Task 2)
// Module resolution hooks for `npm run test:unit` (plain Node with
// --experimental-strip-types, no bundler, no vitest).
//
// Source files use extensionless relative imports ('./score'), which tsc
// (moduleResolution: Bundler) and Vite resolve fine, but Node's ESM loader
// does not: it needs an explicit extension, and it does NOT map './x.js'
// to './x.ts' under --experimental-strip-types (verified on Node 24).
//
// This loader maps, for relative specifiers only:
//   './score'    -> './score.ts'  (if it exists)
//   './score.js' -> './score.ts'  (if it exists)
// Everything else (npm packages, node: builtins, explicit .ts/.json)
// falls through to Node's default resolution.
//
// Registered by tools/test-register.mjs (see the test:unit script). These
// files are NOT bundled into the app: tsconfig.server/client only include
// src/**, and vite.config.ts does not reference them.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const HAS_EXTENSION = /\.[a-z0-9]+$/i;

export async function resolve(specifier, context, next) {
  if (typeof specifier === 'string' && specifier.startsWith('.')) {
    const parentPath = dirname(fileURLToPath(context.parentURL));
    const base = resolvePath(parentPath, specifier);
    if (!HAS_EXTENSION.test(base) && existsSync(`${base}.ts`)) {
      return next(pathToFileURL(`${base}.ts`).href, context);
    }
    if (base.endsWith('.js') && existsSync(`${base.slice(0, -3)}.ts`)) {
      return next(pathToFileURL(`${base.slice(0, -3)}.ts`).href, context);
    }
  }
  return next(specifier, context);
}

// src/client/game/levels.ts — P1
// Finds and loads the level files in /levels (01 Task 3.2).
//
// import.meta.glob is a Vite feature: at build time, every levels/*.json file becomes a
// small separate chunk of the client bundle. So levels work inside the Reddit post with
// no extra server request, and a level is only downloaded when it is opened.

/// <reference types="vite/client" />

import type { Level, LocationId } from '../../shared/types';
import { parseLevel } from './levelPlayer.ts';

const files = import.meta.glob<unknown>('../../../levels/*.json', { import: 'default' });

/** "../../../levels/cafe-03.json" → "cafe-03" */
const idFromPath = (path: string): string => path.slice(path.lastIndexOf('/') + 1, -'.json'.length);

const loaders = new Map<string, () => Promise<unknown>>(
  Object.entries(files)
    .map(([path, load]) => [idFromPath(path), load] as const)
    .filter(([id]) => !id.startsWith('test-')), // test-<twist>.json are dev-only (Task 4)
);

/** Every playable level id, sorted: cafe-01, cafe-02, ... */
export function levelIds(location?: LocationId): string[] {
  return [...loaders.keys()].filter((id) => location === undefined || id.startsWith(`${location}-`)).sort();
}

/** Loads and validates one level. Throws if it doesn't exist or is broken. */
export async function loadLevel(id: string): Promise<Level> {
  const load = loaders.get(id) ?? files[`../../../levels/${id}.json`]; // test levels are still loadable by id
  if (!load) throw new Error(`level "${id}" not found in /levels`);
  return parseLevel(await load(), id);
}

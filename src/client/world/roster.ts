// P2 (Nassime) : les 180 clients (30 par lieu), générés par blender/build_customers.py.
// Le manifest (id, nom, lieu, taille, réplique) est écrit par le même script : le code et
// les .glb ne peuvent pas se désynchroniser.
//
// Qui vient au comptoir ?
//   - Service du Jour : tirage « graine = dayId + lieu ». Tous les joueurs voient les mêmes
//     clients le même soir (00 §1 : la nuit est identique pour tout le monde), mais ils
//     changent chaque nuit. Le score ne dépend jamais du client.
//   - Niveaux et Visite : tirage vraiment aléatoire, sans doublon dans une même partie.
import * as THREE from 'three';
import manifest from './customers.manifest.json';
import { pickGuestIds } from '../../shared/guests.ts';
import type { LocationId } from './location';

export type CustomerSize = 'tall' | 'small' | 'floater';

export interface CustomerInfo {
  id: string;
  name: string;
  location: LocationId;
  size: CustomerSize;
  line: string;
}

const ALL = manifest as CustomerInfo[];
const BY_ID = new Map(ALL.map((c) => [c.id, c]));

export function rosterFor(location: LocationId): CustomerInfo[] {
  return ALL.filter((c) => c.location === location);
}

export function customerInfo(id: string): CustomerInfo | undefined {
  return BY_ID.get(id);
}

/**
 * Where each size stands (scene coordinates of the location; the glass is at the origin):
 * tall ones behind the bar on the back-bar floor, small ones ON the counter beside the glass,
 * floaters hovering behind the counter. All on the left of the glass, so it stays visible.
 */
export function spotFor(size: CustomerSize): THREE.Vector3 {
  if (size === 'small') return new THREE.Vector3(0.22, 0.0, 0.05);
  // z ≈ 0.58: in front of the back-wall props (shelves, fireplace, barrels) of every location
  if (size === 'floater') return new THREE.Vector3(0.3, -0.1, 0.56);
  return new THREE.Vector3(0.32, -0.34, 0.58);
}

/** `count` different customers of `location`: seeded by `seed` (Daily Shift) or random. */
export function pickCustomers(location: LocationId, count: number, seed?: string): CustomerInfo[] {
  // One implementation (shared/guests.ts): the server re-runs this exact
  // pick for the shareText emojis, so the two sides can never drift apart.
  return pickGuestIds(ALL, location, count, seed).map((id) => {
    const info = BY_ID.get(id);
    if (info === undefined) throw new Error(`roster: unknown customer "${id}"`);
    return info;
  });
}

// src/shared/guests.ts — P2 (pick) + P3 (seeded guests both sides share)
// Who stands at the counter, decided WITHOUT a server round-trip.
//
// The Daily Shift is seeded — seed = dayId + location — so every player
// sees the same guests on the same night (00 §1), and they change nightly.
// The client (world/roster.ts pickCustomers) and the server (fallback.ts:
// the seeded fallback night writes the same pick into GlassSpec.customer)
// run THE SAME shuffle here, so both sides always agree on the guests.
// The score never depends on the guest.
//
// Levels and Visit mode pass no seed: Math.random, no two parties alike.
//
// Pure arithmetic + strings only (no three, no JSON import): Node, Vite and
// Devvit can all load this file as-is.
import type { LocationId } from './types';

export type GuestRosterEntry = {
  id: string;
  location: LocationId;
};

/** FNV-1a hash (moved verbatim from world/roster.ts so both sides share it). */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32): same seed, same sequence, on every device. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue; // unreachable: j <= i < length
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * `count` guest ids from `location`'s roster: seeded by `seed` (Daily
 * Shift) or random (Levels / Visit). Same input order + same seed = same
 * ids, on the client and on the server. Cycles when count exceeds the
 * roster (a location always has more guests than glasses).
 */
export function pickGuestIds(
  roster: readonly GuestRosterEntry[],
  location: LocationId,
  count: number,
  seed?: string
): string[] {
  const filtered = roster.filter((c) => c.location === location);
  const random = seed === undefined ? Math.random : mulberry32(hashSeed(`${seed}|${location}`));
  const order = shuffled(filtered, random);
  return Array.from({ length: count }, (_, i) => {
    const entry = order[i % order.length];
    if (entry === undefined) throw new Error(`guests: no customers for location "${location}"`);
    return entry.id;
  });
}

/** §6.1 shareText example customers: these emojis are pinned by the contract. */
const CURATED_EMOJI: Record<string, string> = {
  giant: '🍺',
  fairy: '🧚',
  ghost: '👻',
  pirate: '⛵',
  wizard: '🧙',
};

/** Fallback glyphs for the other 175 customers (deterministic per id, below). */
const GUEST_EMOJI_PALETTE: readonly string[] = [
  '🥛',
  '🍷',
  '🍸',
  '🍹',
  '🧉',
  '🍵',
  '🧋',
  '🥤',
  '🧃',
  '🍻',
  '🥂',
  '🎃',
  '🦇',
  '🧛',
  '🕯️',
  '🌙',
  '⭐',
  '🎭',
  '🍀',
  '🌊',
  '⛰️',
  '🎪',
  '🏰',
  '☕',
];

/**
 * One stable glyph per customer for shareText. Same id = same emoji, every
 * night, on every device — so the emoji always names the guest shown.
 */
export function emojiForCustomer(customerId: string): string {
  const curated = CURATED_EMOJI[customerId];
  if (curated !== undefined) return curated;
  const glyph = GUEST_EMOJI_PALETTE[hashSeed(customerId) % GUEST_EMOJI_PALETTE.length];
  return glyph ?? '🥛';
}

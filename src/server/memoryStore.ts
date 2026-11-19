// src/server/memoryStore.ts — P3 (Task 2)
// In-memory Store for unit tests and local runs without Reddit.
// Single-threaded, so hSetNX is naturally atomic here; on real Redis the
// atomicity comes from the server (that is what blocks double pours).
import type { Store, StoreZEntry, StoreZMember } from './redis';

export class MemoryStore implements Store {
  private strings = new Map<string, string>();
  private hashes = new Map<string, Map<string, string>>();
  private zsets = new Map<string, Map<string, number>>();

  async get(key: string): Promise<string | undefined> {
    return this.strings.get(key);
  }

  async set(key: string, value: string): Promise<string> {
    this.strings.set(key, value);
    return 'OK';
  }

  async hSetNX(key: string, field: string, value: string): Promise<number> {
    let hash = this.hashes.get(key);
    if (hash === undefined) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    if (hash.has(field)) return 0;
    hash.set(field, value);
    return 1;
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    return this.hashes.get(key)?.get(field);
  }

  async hSet(key: string, fieldValues: Record<string, string>): Promise<number> {
    let hash = this.hashes.get(key);
    if (hash === undefined) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    let added = 0;
    for (const [field, value] of Object.entries(fieldValues)) {
      if (!hash.has(field)) added += 1;
      hash.set(field, value);
    }
    return added;
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [field, value] of this.hashes.get(key) ?? []) {
      out[field] = value;
    }
    return out;
  }

  async hIncrBy(key: string, field: string, value: number): Promise<number> {
    let hash = this.hashes.get(key);
    if (hash === undefined) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    const next = (Number(hash.get(field) ?? '0') || 0) + value;
    hash.set(field, String(next));
    return next;
  }

  async zAdd(key: string, ...members: StoreZMember[]): Promise<number> {
    let set = this.zsets.get(key);
    if (set === undefined) {
      set = new Map();
      this.zsets.set(key, set);
    }
    let added = 0;
    for (const { member, score } of members) {
      if (!set.has(member)) added += 1;
      set.set(member, score);
    }
    return added;
  }

  private sorted(key: string): StoreZEntry[] {
    const set = this.zsets.get(key);
    if (set === undefined) return [];
    return [...set.entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || (a.member < b.member ? -1 : 1));
  }

  async zRank(key: string, member: string): Promise<number | undefined> {
    const rank = this.sorted(key).findIndex((entry) => entry.member === member);
    return rank === -1 ? undefined : rank;
  }

  async zCard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0;
  }

  async zScore(key: string, member: string): Promise<number | undefined> {
    return this.zsets.get(key)?.get(member);
  }

  async mGet(keys: string[]): Promise<(string | null)[]> {
    return keys.map((key) => this.strings.get(key) ?? null);
  }

  async zRange(key: string, start: number, stop: number): Promise<StoreZEntry[]> {
    const entries = this.sorted(key);
    const end = stop < 0 ? entries.length + stop + 1 : stop + 1;
    return entries.slice(Math.max(0, start), Math.max(0, end));
  }

  /** Highest-score-first range, for leaderboards (Task 4). Not in Store yet. */
  async zRevRange(key: string, start: number, stop: number): Promise<StoreZEntry[]> {
    return this.sorted(key)
      .reverse()
      .slice(start, stop + 1);
  }

  async expire(_key: string, _seconds: number): Promise<void> {
    // No TTL in the in-memory twin; entries live for the process lifetime.
  }
}

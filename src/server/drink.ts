// src/server/drink.ts — P3 (Task 5)
// The drink of the day (brief T5.2): the community proposes drinks as
// comments starting with `!boisson` on the nightly post; a mod picks the
// winner with the "Choisir la boisson du jour" menu item on the post
// (usually the most-voted one — its score is shown in the toast); the
// next publishNight() carries it into the new day.
//
// Storage:
//   drink:picked:{postId}  validated drink text for that post's night
//   drink:day:{dayId}      live overlay for a published day
// Content files carry a DEFAULT drinkOfTheDay; the live overlay wins
// when present (see withLiveDrink, applied by GET /api/init).
import type { DailyService } from '../shared/types';
import type { Store } from './redis';

export const DRINK_PREFIX = '!boisson';
export const DRINK_MAX_LENGTH = 60;

export function pickedDrinkKey(postId: string): string {
  return `drink:picked:${postId}`;
}

export function dayDrinkKey(dayId: string): string {
  return `drink:day:${dayId}`;
}

export type DrinkComment = {
  id: string;
  body: string;
  score: number;
};

/** Minimal Reddit surface the drink flow needs (faked in tests). */
export type DrinkComments = {
  listPostComments(input: { postId: string; limit: number }): Promise<DrinkComment[]>;
};

export type DrinkCandidate = {
  text: string;
  commentId: string;
  score: number;
};

/** Parse one comment body into a drink proposal, if it qualifies. */
export function parseDrinkProposal(body: string): string | undefined {
  const trimmed = body.trimStart();
  if (!trimmed.startsWith(DRINK_PREFIX)) return undefined;
  const text = trimmed.slice(DRINK_PREFIX.length).trim();
  if (text.length === 0 || text.length > DRINK_MAX_LENGTH) return undefined;
  if (text.includes('\n')) return undefined;
  return text;
}

/** Top-voted proposal wins; ties break toward the earliest comment. */
export function pickDrinkCandidate(comments: DrinkComment[]): DrinkCandidate | undefined {
  let best: DrinkCandidate | undefined;
  for (const comment of comments) {
    const text = parseDrinkProposal(comment.body);
    if (text === undefined) continue;
    if (best === undefined || comment.score > best.score) {
      best = { text, commentId: comment.id, score: comment.score };
    }
  }
  return best;
}

export type DrinkPickOutcome =
  | { ok: true; candidate: DrinkCandidate }
  | { ok: false; error: string };

/** Mod action: pick the top proposal on a post and store it as validated. */
export async function pickAndStoreDrink(
  store: Store,
  comments: DrinkComments,
  postId: string
): Promise<DrinkPickOutcome> {
  let list: DrinkComment[];
  try {
    list = await comments.listPostComments({ postId, limit: 200 });
  } catch (error) {
    return { ok: false, error: `Could not read comments: ${String(error)}` };
  }
  const candidate = pickDrinkCandidate(list);
  if (candidate === undefined) {
    return { ok: false, error: 'No !boisson proposal on this post yet' };
  }
  await store.set(pickedDrinkKey(postId), candidate.text);
  return { ok: true, candidate };
}

/** Validated drink for a published post, if a mod picked one. */
export async function pickedDrinkForPost(store: Store, postId: string): Promise<string | undefined> {
  const raw = await store.get(pickedDrinkKey(postId));
  return raw === undefined || raw.length === 0 ? undefined : raw;
}

/** Live drink overlay for a day, if the publisher stored one. */
export async function liveDrinkForDay(store: Store, dayId: string): Promise<string | undefined> {
  const raw = await store.get(dayDrinkKey(dayId));
  return raw === undefined || raw.length === 0 ? undefined : raw;
}

/** Static content default, overridden by the live community drink. */
export function withLiveDrink(day: DailyService, liveDrink: string | undefined): DailyService {
  if (liveDrink === undefined) return day;
  return { ...day, drinkOfTheDay: liveDrink };
}

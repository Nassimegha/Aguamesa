// src/server/share.ts — P3 (Task 4)
// POST /api/share: posts the night's shareText as a comment under the
// post, ONCE per night, from the PLAYER's account (runAs USER — see the
// adapter in social.ts and the reddit user scope in devvit.json).
import { nightKey, type Store } from './redis';

export function shareKey(dayId: string, username: string): string {
  return `day:${dayId}:share:${username}`;
}

/** Minimal Reddit surface shareNight needs (faked in tests). */
export type CommentPoster = {
  submitPlayerComment(input: { postId: string; text: string }): Promise<{ commentUrl: string }>;
};

export type ShareOutcome =
  | { ok: true; commentUrl: string; replayed: boolean }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readShareText(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && typeof parsed['shareText'] === 'string') return parsed['shareText'];
    return undefined;
  } catch {
    return undefined;
  }
}

export async function shareNight(
  store: Store,
  poster: CommentPoster,
  dayId: string,
  username: string,
  postId: string
): Promise<ShareOutcome> {
  if (postId.length === 0) return { ok: false, error: 'Share needs the post id' };
  const shareText = readShareText(await store.get(nightKey(dayId, username)));
  if (shareText === undefined) return { ok: false, error: 'Finish the night before sharing it' };
  const existing = await store.get(shareKey(dayId, username));
  if (existing !== undefined && existing.length > 0) {
    return { ok: true, commentUrl: existing, replayed: true };
  }
  let commentUrl: string;
  try {
    commentUrl = (await poster.submitPlayerComment({ postId, text: shareText })).commentUrl;
  } catch (error) {
    return { ok: false, error: `Comment posting failed: ${String(error)}` };
  }
  if (commentUrl.length === 0) return { ok: false, error: 'Reddit returned an empty comment URL' };
  await store.set(shareKey(dayId, username), commentUrl);
  return { ok: true, commentUrl, replayed: false };
}

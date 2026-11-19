import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, redis } from '@devvit/web/server';
import { createPost } from '../core/post';
import { publishNight } from '../daily';
import { todayDayId } from '../dates';
import { pickAndStoreDrink } from '../drink';
import { createNightPoster } from '../poster';
import type { Store } from '../redis';
import { createDrinkComments } from '../social';

export const menu = new Hono();

const store: Store = redis;
const poster = createNightPoster();
const drinkComments = createDrinkComments();

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      400
    );
  }
});

menu.post('/publish-now', async (c) => {
  // Mod-only "Publier la nuit maintenant" (brief T3 piège): never wait for
  // midnight to test the nightly post.
  const dayId = todayDayId();
  const outcome = await publishNight(store, poster, context.subredditName, dayId);
  if (!outcome.ok) {
    console.error(`[aguamesa] publish-now failed for ${dayId}: ${outcome.error}`);
    return c.json<UiResponse>({ showToast: `Publish failed: ${outcome.error}` }, 200);
  }
  return c.json<UiResponse>(
    {
      showToast:
        `Night #${outcome.night} published` +
        `${outcome.fromFallback ? ' (fallback content)' : ''}` +
        `${outcome.replayed ? ' (already existed)' : ''}`,
    },
    200
  );
});

menu.post('/drink-pick', async (c) => {
  // Mod-only, on a nightly post: validate the top !boisson proposal as
  // the next day's drink (brief T5.2). Run it on yesterday's post before
  // (or after — the overlay applies on read) today's publish.
  const postId = context.postId;
  if (postId === undefined) {
    return c.json<UiResponse>({ showToast: 'Use this on a nightly post' }, 200);
  }
  const outcome = await pickAndStoreDrink(store, drinkComments, postId);
  if (!outcome.ok) {
    return c.json<UiResponse>({ showToast: outcome.error }, 200);
  }
  return c.json<UiResponse>(
    { showToast: `Boisson du jour : ${outcome.candidate.text} (+${outcome.candidate.score})` },
    200
  );
});

menu.post('/example-form', async (c) => {
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'exampleForm',
        form: {
          title: 'Example form',
          fields: [{ name: 'message', label: 'Message', type: 'string' }],
        },
      },
    },
    200
  );
});

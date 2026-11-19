import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, redis } from '@devvit/web/server';
import { createPost } from '../core/post';
import { publishNight } from '../daily';
import { todayDayId } from '../dates';
import { createNightPoster } from '../poster';
import type { Store } from '../redis';

export const menu = new Hono();

const store: Store = redis;
const poster = createNightPoster();

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

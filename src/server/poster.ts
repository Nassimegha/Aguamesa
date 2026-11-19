// src/server/poster.ts — P3 (Task 3)
// The real NightPoster: creates the nightly custom post (with its dayId
// pinned in postData) and pins it. Shared by the scheduler handler and
// the mod menu item. Imports @devvit/web/server, so unit tests must use
// a fake NightPoster instead of this module.
import { reddit } from '@devvit/web/server';
import type { NightPoster } from './daily';

export function createNightPoster(): NightPoster {
  return {
    submitNightPost: async ({ subredditName, title, dayId, night }) => {
      const post = await reddit.submitCustomPost({
        subredditName,
        title,
        postData: { dayId, night },
        textFallback: { text: `Aguamesa — ${title}. Play the 5 glasses of the night!` },
      });
      await post.sticky();
      return { postId: post.id };
    },
  };
}

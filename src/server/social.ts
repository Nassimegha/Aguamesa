// src/server/social.ts — P3 (Task 4)
// Real Reddit adapters for sharing and flair (unit tests fake these
// interfaces instead of importing this module):
//   - comments are posted runAs USER: the score comment appears under the
//     player's own name. Requires "reddit": { "scope": "user" } in
//     devvit.json (Devvit prompts/permits user actions on that scope).
//   - flairs are set from the app account (moderator power on install).
import { reddit } from '@devvit/web/server';
import { isT3 } from '@devvit/web/shared';
import type { FlairSetter } from './flair';
import type { CommentPoster } from './share';

export function createCommentPoster(): CommentPoster {
  return {
    submitPlayerComment: async ({ postId, text }) => {
      if (!isT3(postId)) throw new Error(`Not a post id: ${postId}`);
      const comment = await reddit.submitComment({ id: postId, text, runAs: 'USER' });
      return { commentUrl: `https://www.reddit.com${comment.permalink}` };
    },
  };
}

export function createFlairSetter(): FlairSetter {
  return {
    setPlayerFlair: async ({ subredditName, username, text }) => {
      await reddit.setUserFlair({ subredditName, username, text });
    },
  };
}

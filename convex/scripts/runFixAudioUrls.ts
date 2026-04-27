/**
 * Internal wrapper for running the fixAudioUrls migration.
 * Example: `bun x convex run internal.scripts.runFixAudioUrls.run`
 * (not exposed to browser clients).
 */

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

type FixAudioUrlsResult = {
  total: number;
  fixed: number;
  skipped: number;
};

export const run = internalMutation({
  args: {},
  handler: async (ctx): Promise<FixAudioUrlsResult> => {
    const result: FixAudioUrlsResult = await ctx.runMutation(
      internal.scripts.fixAudioUrls.fixAudioUrls,
      {}
    );

    console.log("[runFixAudioUrls] Migration complete:", result);
    return result;
  },
});

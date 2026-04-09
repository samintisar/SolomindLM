/**
 * Public wrapper for running the fixAudioUrls migration
 * Can be called from: bun x convex run scripts/runFixAudioUrls
 */

import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";

type FixAudioUrlsResult = {
  total: number;
  fixed: number;
  skipped: number;
};

export const run = mutation({
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

import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { parseAudioUrl, storageUrlForRef } from "../../_model/audioOverviews";

/**
 * Quick fix for a specific audio overview URL
 * Call with: bun x convex run studio/audio/fixAudioUrl --runManaged '{"audioOverviewId":"kn73xvetyq755bm37d1tq9r3z984h6y1"}'
 */
export const fixSpecificAudioUrl = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
  },
  handler: async (ctx, args) => {
    const overview = await ctx.db.get(args.audioOverviewId);

    if (!overview) {
      throw new Error("Audio overview not found");
    }

    console.log(`[fixSpecificAudioUrl] Processing audio overview: ${args.audioOverviewId}`);
    console.log(`  Current audioUrl: ${overview.audioUrl}`);

    if (!overview.audioUrl) {
      throw new Error("No audioUrl found on this overview");
    }

    // Extract storage ID from the URL
    const target = parseAudioUrl(overview.audioUrl);
    if (!target || !("storageRef" in target)) {
      throw new Error(`audioUrl is not a storage reference: ${overview.audioUrl}`);
    }
    const storageId = target.storageRef;

    console.log(`  Extracted storageId: ${storageId}`);

    // Generate the correct Convex storage URL
    const correctUrl = await storageUrlForRef(ctx, storageId);

    if (!correctUrl) {
      throw new Error(`Failed to get Convex storage URL for storageId: ${storageId}`);
    }

    console.log(`  Correct URL: ${correctUrl}`);

    // Update the database
    await ctx.db.patch(args.audioOverviewId, {
      audioUrl: correctUrl,
    });

    console.log(`[fixSpecificAudioUrl] ✅ Fixed!`);

    return {
      oldUrl: overview.audioUrl,
      newUrl: correctUrl,
    };
  },
});

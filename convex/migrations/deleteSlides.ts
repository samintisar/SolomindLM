import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Migration: Delete all legacy slides data.
 * Run this after deploying the schema with both slides and infographics tables.
 */
export const deleteAllSlides = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    let deleted = 0;
    let hasMore = true;

    while (hasMore) {
      const slides = await ctx.db
        .query("slides")
        .take(batchSize);

      if (slides.length === 0) {
        hasMore = false;
        break;
      }

      for (const slide of slides) {
        await ctx.db.delete(slide._id);
        deleted++;
      }

      if (slides.length < batchSize) {
        hasMore = false;
      }
    }

    return { deleted };
  },
});

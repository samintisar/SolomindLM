import { v } from "convex/values";
import { mutation } from "../_generated/server";

/**
 * One-time backfill. Run via `bun x convex run onboarding/backfill:backfillLegacyOnboarding`.
 * Safe to run multiple times — only inserts rows for users that don't have one yet.
 *
 * NOTE: This is intentionally not auth-gated because it's invoked from the Convex
 * CLI by an operator, not from the client. If you need to expose it to a UI, wrap
 * it in a separate auth-gated entry point.
 */
export const backfillLegacyOnboarding = mutation({
  args: {},
  returns: v.object({ created: v.number(), skipped: v.number() }),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let created = 0;
    let skipped = 0;
    for (const user of users) {
      const existing = await ctx.db
        .query("userOnboarding")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique();
      if (existing) {
        skipped++;
        continue;
      }
      await ctx.db.insert("userOnboarding", {
        userId: user._id,
        tourStatus: "completed",
        checklistDismissed: true,
      });
      created++;
    }
    return { created, skipped };
  },
});

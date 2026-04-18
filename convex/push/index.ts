import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "../auth";

/**
 * Upsert the caller's Expo push token for mobile notifications.
 * Called from the native shell when the user is authenticated on the Convex client.
 */
export const registerExpoPushToken = mutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }

    const existing = await ctx.db
      .query("mobilePushTokens")
      .withIndex("by_token", (q) => q.eq("expoPushToken", args.token))
      .first();

    const now = Date.now();
    if (existing) {
      if (existing.userId !== userId) {
        await ctx.db.delete(existing._id);
        return await ctx.db.insert("mobilePushTokens", {
          userId,
          expoPushToken: args.token,
          platform: args.platform,
          createdAt: now,
          updatedAt: now,
        });
      }
      await ctx.db.patch(existing._id, { platform: args.platform, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("mobilePushTokens", {
      userId,
      expoPushToken: args.token,
      platform: args.platform,
      createdAt: now,
      updatedAt: now,
    });
  },
});

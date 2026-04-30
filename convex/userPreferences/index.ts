import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import { getAuthUserId } from "../auth";
import { VALID_LANGUAGE_CODES } from "../_agents/_shared/languageInstruction";

export const getMyPreferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return prefs ? { outputLanguage: prefs.outputLanguage } : null;
  },
});

export const getPreferencesByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    return prefs ? { outputLanguage: prefs.outputLanguage } : null;
  },
});

export const setOutputLanguage = mutation({
  args: { outputLanguage: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Unauthenticated");
    if (!VALID_LANGUAGE_CODES.includes(args.outputLanguage)) {
      throw new ConvexError("Unsupported language code");
    }
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        outputLanguage: args.outputLanguage,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId,
        outputLanguage: args.outputLanguage,
        updatedAt: Date.now(),
      });
    }
  },
});

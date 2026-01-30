import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get current cache version for an agent type
 */
export const getCacheVersion = internalQuery({
  args: { agentType: v.string() },
  handler: async (ctx, { agentType }) => {
    const version = await ctx.db
      .query("cacheVersions")
      .withIndex("by_agent", (q) => q.eq("agentType", agentType))
      .first();
    return version?.version || "v1";
  },
});

/**
 * Invalidate cache for an agent type by bumping version
 * This forces all new requests to miss cache and recompute
 */
export const invalidateAgentCache = internalMutation({
  args: { agentType: v.string() },
  handler: async (ctx, { agentType }) => {
    const existing = await ctx.db
      .query("cacheVersions")
      .withIndex("by_agent", (q) => q.eq("agentType", agentType))
      .first();

    const newVersion = `v${parseInt((existing?.version || "v1").slice(1)) + 1}`;

    if (existing) {
      await ctx.db.patch(existing._id, {
        version: newVersion,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("cacheVersions", {
        agentType,
        version: newVersion,
        updatedAt: Date.now(),
      });
    }

    console.log(`[Cache] Invalidated ${agentType}: now ${newVersion}`);
  },
});

/**
 * Invalidate all caches
 */
export const invalidateAllCaches = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allVersions = await ctx.db.query("cacheVersions").collect();

    for (const version of allVersions) {
      const newVersion = `v${parseInt(version.version.slice(1)) + 1}`;
      await ctx.db.patch(version._id, {
        version: newVersion,
        updatedAt: Date.now(),
      });
    }

    console.log(`[Cache] Invalidated ${allVersions.length} agent types`);
  },
});

/**
 * Invalidate all generation-related caches (called when documents are updated)
 */
export const invalidateGenerationCaches = internalMutation({
  args: {},
  handler: async (ctx) => {
    const agentTypes = [
      "flashcard",
      "quiz",
      "mindmap",
      "report",
      "spreadsheet",
      "writtenQuestions",
    ];

    for (const agentType of agentTypes) {
      const existing = await ctx.db
        .query("cacheVersions")
        .withIndex("by_agent", (q) => q.eq("agentType", agentType))
        .first();

      const newVersion = `v${parseInt((existing?.version || "v1").slice(1)) + 1}`;

      if (existing) {
        await ctx.db.patch(existing._id, {
          version: newVersion,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("cacheVersions", {
          agentType,
          version: newVersion,
          updatedAt: Date.now(),
        });
      }
    }

    console.log(`[Cache] Invalidated ${agentTypes.length} generation agent types`);
  },
});

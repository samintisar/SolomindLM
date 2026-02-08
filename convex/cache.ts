import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get current cache version for an agent type
 */
/**
 * Cache Version Management Documentation
 * 
 * When to call invalidateAgentCache:
 * 
 * 1. AI Model Changes: When upgrading AI models (e.g., GPT-4 → GPT-4.5, Claude 3 → Claude 3.5)
 * 2. Prompt Template Updates: When modifying system prompts or instruction templates
 * 3. Output Schema Changes: When the structure of generated content changes significantly
 * 4. Bug Fixes: When fixing generation logic that affects output quality
 * 
 * When NOT to invalidate:
 * - Minor code refactoring that doesn't affect output
 * - Performance optimizations that preserve behavior
 * - UI/UX changes that don't touch generation logic
 * 
 * Cache Invalidation Strategy:
 * - Version-based: Each invalidation bumps the version (v1 → v2 → v3)
 * - Automatic: Old cache entries remain until TTL expires, but new requests use the new version
 * - Selective: Only the affected agent type is invalidated, not all caches
 * 
 * Example usage:
 * ```typescript
 * // After deploying new prompt template
 * await ctx.runMutation(internal.cache.invalidateAgentCache, {
 *   agentType: "flashcard",
 * });
 * ```
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

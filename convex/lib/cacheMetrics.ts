import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const recordCacheHit = internalMutation({
  args: {
    cacheType: v.string(),
    agentType: v.optional(v.string()),
  },
  handler: async (ctx, { cacheType, agentType }) => {
    // Use a full table scan to find matching records
    const existing = await ctx.db
      .query("cacheMetrics")
      .filter((q) =>
        q.and(
          q.eq(q.field("cacheType"), cacheType),
          agentType === undefined
            ? q.eq(q.field("agentType"), null)
            : q.eq(q.field("agentType"), agentType)
        )
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        hits: existing.hits + 1,
        lastHitAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("cacheMetrics", {
        cacheType,
        agentType,
        hits: 1,
        misses: 0,
        lastHitAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

export const recordCacheMiss = internalMutation({
  args: {
    cacheType: v.string(),
    agentType: v.optional(v.string()),
  },
  handler: async (ctx, { cacheType, agentType }) => {
    // Use a full table scan to find matching records
    const existing = await ctx.db
      .query("cacheMetrics")
      .filter((q) =>
        q.and(
          q.eq(q.field("cacheType"), cacheType),
          agentType === undefined
            ? q.eq(q.field("agentType"), null)
            : q.eq(q.field("agentType"), agentType)
        )
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        misses: existing.misses + 1,
        lastMissAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("cacheMetrics", {
        cacheType,
        agentType,
        hits: 0,
        misses: 1,
        lastMissAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

export const getCacheStats = internalQuery({
  args: {
    cacheType: v.optional(v.string()),
    agentType: v.optional(v.string()),
  },
  handler: async (ctx, { cacheType }) => {
    let query = ctx.db.query("cacheMetrics");

    if (cacheType) {
      query = query.filter((q) => q.eq(q.field("cacheType"), cacheType));
    }

    const metrics = await query.collect();

    return metrics.map((m) => ({
      ...m,
      hitRate: m.hits / (m.hits + m.misses),
      totalRequests: m.hits + m.misses,
    }));
  },
});

export const getOverallCacheStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const metrics = await ctx.db.query("cacheMetrics").collect();

    const totalHits = metrics.reduce((sum: number, m) => sum + m.hits, 0);
    const totalMisses = metrics.reduce((sum: number, m) => sum + m.misses, 0);

    return {
      totalHits,
      totalMisses,
      totalRequests: totalHits + totalMisses,
      hitRate: totalHits / (totalHits + totalMisses),
      byAgentType: metrics.map((m) => ({
        agentType: m.agentType || "unknown",
        cacheType: m.cacheType,
        hits: m.hits,
        misses: m.misses,
        hitRate: m.hits / (m.hits + m.misses),
        totalRequests: m.hits + m.misses,
      })),
    };
  },
});

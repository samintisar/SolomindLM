import { internalMutation, internalQuery } from "../../_generated/server";
import { v } from "convex/values";

export const recordCacheHit = internalMutation({
  args: {
    cacheType: v.string(),
    agentType: v.optional(v.string()),
  },
  handler: async (ctx, { cacheType, agentType }) => {
    const candidates = await ctx.db
      .query("cacheMetrics")
      .withIndex("by_type", (q) => q.eq("cacheType", cacheType))
      .collect();
    const existing = candidates.find(
      (m) =>
        (agentType === undefined && m.agentType === undefined) || m.agentType === agentType
    );

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
    const candidates = await ctx.db
      .query("cacheMetrics")
      .withIndex("by_type", (q) => q.eq("cacheType", cacheType))
      .collect();
    const existing = candidates.find(
      (m) =>
        (agentType === undefined && m.agentType === undefined) || m.agentType === agentType
    );

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
  handler: async (ctx, { cacheType, agentType }) => {
    let metrics;
    if (cacheType) {
      const rows = await ctx.db
        .query("cacheMetrics")
        .withIndex("by_type", (q) => q.eq("cacheType", cacheType))
        .collect();
      metrics =
        agentType === undefined
          ? rows
          : rows.filter((m) => m.agentType === agentType);
    } else {
      metrics = await ctx.db.query("cacheMetrics").collect();
    }

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

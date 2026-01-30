/**
 * RateLimitService - Convex-based rate limiting
 * Uses Convex for atomic operations instead of PostgreSQL
 */

import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';

/**
 * Check and increment rate limit atomically
 * @param userId - User ID
 * @param endpoint - Endpoint to rate limit
 * @param limit - Max requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns Rate limit check result
 */
export const checkAndIncrement = internalMutation({
  args: {
    userId: v.string(),
    endpoint: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowStart = now - (now % args.windowMs);
    const windowEnd = windowStart + args.windowMs;

    // Find existing rate limit entry
    const existing = await ctx.db
      .query('rateLimits')
      .withIndex('by_user_endpoint', (q) =>
        q
          .eq('userId', args.userId)
          .eq('endpoint', args.endpoint)
      )
      .first();

    if (existing && existing.windowStart === windowStart) {
      // Increment existing counter
      const newCount = existing.count + 1;
      const allowed = newCount <= args.limit;

      await ctx.db.patch(existing._id, {
        count: newCount,
        windowEnd,
      });

      return {
        allowed,
        limit: args.limit,
        remaining: Math.max(0, args.limit - newCount),
        reset_at: new Date(windowEnd),
      };
    }

    // Create new entry
    await ctx.db.insert('rateLimits', {
      userId: args.userId,
      endpoint: args.endpoint,
      count: 1,
      windowStart,
      windowEnd,
    });

    return {
      allowed: true,
      limit: args.limit,
      remaining: args.limit - 1,
      reset_at: new Date(windowEnd),
    };
  },
});

/**
 * Get current rate limit status without incrementing
 * @param userId - User ID
 * @param endpoint - Endpoint to check
 * @returns Current rate limit status
 */
export const getStatus = internalQuery({
  args: {
    userId: v.string(),
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowStart = now - (now % 86400000); // Daily window

    const entry = await ctx.db
      .query('rateLimits')
      .withIndex('by_user_endpoint', (q) =>
        q
          .eq('userId', args.userId)
          .eq('endpoint', args.endpoint)
      )
      .filter((q) => q.gte(q.field('windowStart'), windowStart))
      .first();

    if (!entry) {
      const resetAt = new Date();
      resetAt.setDate(resetAt.getDate() + 1);
      resetAt.setHours(0, 0, 0, 0);

      return {
        limit: 0,
        remaining: 0,
        used: 0,
        reset_at: resetAt,
      };
    }

    return {
      limit: 0, // Configured elsewhere
      remaining: Math.max(0, 0 - entry.count),
      used: entry.count,
      reset_at: new Date(entry.windowEnd),
    };
  },
});

/**
 * Reset usage for testing purposes (admin only)
 * @param userId - User ID
 * @param endpoint - Optional endpoint to reset specific service
 */
export const resetUsage = internalMutation({
  args: {
    userId: v.string(),
    endpoint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const endpoint = args.endpoint || '';
    if (args.endpoint) {
      const entries = await ctx.db
        .query('rateLimits')
        .withIndex('by_user_endpoint', (q) =>
          q.eq('userId', args.userId).eq('endpoint', endpoint)
        )
        .collect();

      for (const entry of entries) {
        await ctx.db.delete(entry._id);
      }
    } else {
      const entries = await ctx.db
        .query('rateLimits')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .collect();

      for (const entry of entries) {
        await ctx.db.delete(entry._id);
      }
    }
  },
});

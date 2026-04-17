import { getAuthUserId } from "../auth";
import { MutationCtx, internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import {
  createNotebookLimitError,
  createSourceLimitError,
  createDailyLimitError,
  getFreeLimit,
  getProLimit,
  type DailyFeature,
} from "./errors";
import {
  rateLimiter,
  getFreeLimit as getFreeRateLimit,
  getProLimit as getProRateLimit,
} from "./rateLimits";

/**
 * Check if user has reached their notebook limit
 * @throws LimitError if limit is reached
 */
export async function checkNotebookLimit(ctx: MutationCtx): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthenticated");

  // Check if user has an active subscription
  const subscription = await ctx.db
    .query("stripeSubscriptions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .filter((q: any) => q.eq(q.field("status"), "active"))
    .first();

  const isPro = !!subscription;
  const limit = isPro ? 100 : 5;

  // Count existing notebooks
  const notebooks = await ctx.db
    .query("notebooks")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();

  if (notebooks.length >= limit) {
    throw createNotebookLimitError(notebooks.length, limit, isPro);
  }
}

/**
 * Check if user has reached their source (document) limit
 * @throws LimitError if limit is reached
 */
export async function checkSourceLimit(ctx: MutationCtx, notebookId: string): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthenticated");

  // Check if user has an active subscription
  const subscription = await ctx.db
    .query("stripeSubscriptions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .filter((q: any) => q.eq(q.field("status"), "active"))
    .first();

  const isPro = !!subscription;
  const limit = isPro ? 500 : 20;

  // Count existing documents for this notebook
  const documents = await ctx.db
    .query("documents")
    .withIndex("by_notebook", (q: any) => q.eq("notebookId", notebookId))
    .collect();

  if (documents.length >= limit) {
    throw createSourceLimitError(documents.length, limit, isPro);
  }
}

/**
 * Get the appropriate limit based on subscription status for any feature
 */
export function getSubscriptionLimit(feature: DailyFeature, isPro: boolean): number {
  return isPro ? getProLimit(feature) : getFreeLimit(feature);
}

/**
 * Check daily limit for a content generation feature.
 * Uses the Convex rate limiter to enforce per-user daily quotas.
 *
 * @throws LimitError if daily limit is reached
 */
export async function checkDailyLimit(
  ctx: MutationCtx,
  userId: string,
  feature: DailyFeature
): Promise<void> {
  // Check subscription status
  const subscription = await ctx.db
    .query("stripeSubscriptions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .filter((q: any) => q.eq(q.field("status"), "active"))
    .first();

  const isPro = !!subscription;
  const suffix = isPro ? "Pro" : "Free";
  const limitKey = `${feature}${suffix}` as const;

  // Check the rate limit
  // This will throw RateLimitError when exceeded
  try {
    await rateLimiter.limit(ctx, limitKey, { key: userId, throws: true });
  } catch (error) {
    // Convert RateLimitError to our structured LimitError
    const limit = isPro ? getProRateLimit(feature) : getFreeRateLimit(feature);

    // The rate limiter doesn't give us exact usage count when rate-limited
    // When we get a rate limit error, it means the user has exceeded their limit
    const used = limit;

    throw createDailyLimitError(feature, used, limit, isPro);
  }
}

/**
 * Internal mutation wrapper for checkDailyLimit.
 * This allows actions to call the daily limit check via ctx.runMutation.
 */
export const checkDailyLimitInternal = internalMutation({
  args: {
    userId: v.string(),
    feature: v.string(),
  },
  handler: async (ctx, args) => {
    await checkDailyLimit(ctx, args.userId as Id<"users">, args.feature as DailyFeature);
  },
});

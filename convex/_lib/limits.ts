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
    .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .first();

  const isPro = !!subscription;
  const limit = isPro ? 100 : 5;

  // Count up to limit+1 to avoid unbounded collect()
  const cap = limit + 1;
  const notebooks = await ctx.db
    .query("notebooks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(cap);

  if (notebooks.length >= limit) {
    throw createNotebookLimitError(notebooks.length, limit, isPro);
  }
}

/**
 * Check if user has reached their source (document) limit.
 * Per-notebook cap is currently the same for free and Pro (see `limit` below); `isPro` only affects error copy.
 */
export async function checkSourceLimit(ctx: MutationCtx, notebookId: string): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthenticated");

  // Check if user has an active subscription
  const subscription = await ctx.db
    .query("stripeSubscriptions")
    .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .first();

  const isPro = !!subscription;
  const limit = 200;

  const cap = limit + 1;
  const documents = await ctx.db
    .query("documents")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId as Id<"notebooks">))
    .take(cap);

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
 * Uses the Convex rate limiter to verify the user is under their quota
 * WITHOUT consuming a token. Call consumeDailyLimit on success.
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
    .withIndex("by_user_and_status", (q) =>
      q.eq("userId", userId as Id<"users">).eq("status", "active")
    )
    .first();

  const isPro = !!subscription;
  const suffix = isPro ? "Pro" : "Free";
  const limitKey = `${feature}${suffix}` as const;

  // Check the rate limit without consuming a token
  // This will throw RateLimitError when exceeded
  try {
    await rateLimiter.check(ctx, limitKey, { key: userId, throws: true });
  } catch {
    // Convert RateLimitError to our structured LimitError
    const limit = isPro ? getProRateLimit(feature) : getFreeRateLimit(feature);

    // The rate limiter doesn't give us exact usage count when rate-limited
    // When we get a rate limit error, it means the user has exceeded their limit
    const used = limit;

    throw createDailyLimitError(feature, used, limit, isPro);
  }
}

/**
 * Consume a daily limit token for a content generation feature.
 * Call this ONLY after the operation has succeeded.
 * Silently logs if consumption fails (e.g. race condition).
 */
export async function consumeDailyLimit(
  ctx: MutationCtx,
  userId: string,
  feature: DailyFeature
): Promise<void> {
  const subscription = await ctx.db
    .query("stripeSubscriptions")
    .withIndex("by_user_and_status", (q) =>
      q.eq("userId", userId as Id<"users">).eq("status", "active")
    )
    .first();

  const isPro = !!subscription;
  const suffix = isPro ? "Pro" : "Free";
  const limitKey = `${feature}${suffix}` as const;

  try {
    await rateLimiter.limit(ctx, limitKey, { key: userId, throws: true });
  } catch (err) {
    // Log but don't fail — the work is already done
    console.warn(`[RateLimit] Failed to consume ${feature} limit for user ${userId}:`, err);
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

/**
 * Internal mutation wrapper for consumeDailyLimit.
 * This allows actions to consume the daily limit token on success.
 */
export const consumeDailyLimitInternal = internalMutation({
  args: {
    userId: v.string(),
    feature: v.string(),
  },
  handler: async (ctx, args) => {
    await consumeDailyLimit(ctx, args.userId as Id<"users">, args.feature as DailyFeature);
  },
});

import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internalMutation, MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthUserId } from "../auth";
import {
  CONCURRENT_RUN_LIMITS,
  createConcurrentRunLimitError,
  createDailyLimitError,
  createNotebookLimitError,
  createProRequiredError,
  createRetryLimitError,
  createSourceLimitError,
  type DailyFeature,
  getFreeLimit,
  getProLimit,
  isProOnlyFeature,
  MAX_RUN_RETRIES,
} from "./errors";
import {
  getFreeLimit as getFreeRateLimit,
  getProLimit as getProRateLimit,
  rateLimiter,
} from "./rateLimits";

/** True when the user has an active Stripe subscription. */
export async function isProUser(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  const subscription = await ctx.db
    .query("stripeSubscriptions")
    .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .first();
  return !!subscription;
}

/**
 * Check if user has reached their notebook limit
 * @throws LimitError if limit is reached
 */
export async function checkNotebookLimit(ctx: MutationCtx): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthenticated");

  const isPro = await isProUser(ctx, userId);
  const limit = isPro ? 200 : 5;

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
 * Free tier is capped at 20 sources per notebook; Pro at 200.
 */
export async function checkSourceLimit(ctx: MutationCtx, notebookId: string): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthenticated");

  const isPro = await isProUser(ctx, userId);
  const limit = isPro ? 200 : 20;

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

function limitKeyFor(feature: DailyFeature, isPro: boolean) {
  return `${feature}${isPro ? "Pro" : "Free"}` as const;
}

/**
 * Check the usage limit for a content generation feature.
 * Uses the Convex rate limiter to verify the user is under their quota
 * WITHOUT consuming a token. Call consumeDailyLimit on success.
 *
 * @throws LimitError if the limit is reached, or if the feature is Pro only
 *   and the user is on Free
 */
export async function checkDailyLimit(
  ctx: MutationCtx,
  userId: string,
  feature: DailyFeature
): Promise<void> {
  const isPro = await isProUser(ctx, userId as Id<"users">);
  if (!isPro && isProOnlyFeature(feature)) {
    throw createProRequiredError(feature);
  }

  // Check the rate limit without consuming a token
  // This will throw RateLimitError when exceeded
  try {
    await rateLimiter.check(ctx, limitKeyFor(feature, isPro), { key: userId, throws: true });
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
 * Consume a usage limit token for a content generation feature.
 * Call this ONLY after the operation has succeeded.
 * Silently logs if consumption fails (e.g. race condition).
 */
export async function consumeDailyLimit(
  ctx: MutationCtx,
  userId: string,
  feature: DailyFeature
): Promise<void> {
  const isPro = await isProUser(ctx, userId as Id<"users">);
  // A Pro-only feature has no Free window to consume (the user downgraded mid-run).
  if (!isPro && isProOnlyFeature(feature)) return;

  try {
    await rateLimiter.limit(ctx, limitKeyFor(feature, isPro), { key: userId, throws: true });
  } catch (err) {
    // Log but don't fail — the work is already done
    console.warn(`[RateLimit] Failed to consume ${feature} limit for user ${userId}:`, err);
  }
}

/**
 * Check and consume one run of a long-running feature in a single step, before
 * the work starts. Runs take minutes, so consuming on success (as Studio does)
 * would let parallel starts all pass the check before any of them counts.
 *
 * @returns whether the user is on Pro, so callers can apply plan-specific caps
 * @throws LimitError when the feature is Pro only or the limit is reached
 */
export async function takeFeatureRun(
  ctx: MutationCtx,
  userId: Id<"users">,
  feature: DailyFeature
): Promise<{ isPro: boolean }> {
  const isPro = await isProUser(ctx, userId);
  if (!isPro && isProOnlyFeature(feature)) {
    throw createProRequiredError(feature);
  }

  const { ok } = await rateLimiter.limit(ctx, limitKeyFor(feature, isPro), { key: userId });
  if (!ok) {
    const limit = getSubscriptionLimit(feature, isPro);
    throw createDailyLimitError(feature, limit, limit, isPro);
  }
  return { isPro };
}

/** Rows not updated for this long are treated as dead, not in progress. */
export const STALE_RUN_MS = 2 * 60 * 60 * 1000;

/** Statuses in which a run is still doing (and paying for) work. */
const ACTIVE_LITERATURE_REVIEW_STATUSES = ["planning", "searching", "processing"] as const;
const ACTIVE_DEEP_RESEARCH_STATUSES = ["planning", "approved", "running"] as const;

async function countActiveRuns(
  ctx: QueryCtx,
  userId: Id<"users">,
  feature: keyof typeof CONCURRENT_RUN_LIMITS,
  cap: number
): Promise<number> {
  const freshSince = Date.now() - STALE_RUN_MS;
  let count = 0;
  if (feature === "literatureReview") {
    for (const status of ACTIVE_LITERATURE_REVIEW_STATUSES) {
      const rows = await ctx.db
        .query("literatureReviewSessions")
        .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", status))
        .take(cap + 1);
      count += rows.filter((row) => row.updatedAt >= freshSince).length;
    }
  } else {
    for (const status of ACTIVE_DEEP_RESEARCH_STATUSES) {
      const rows = await ctx.db
        .query("researchPlans")
        .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", status))
        .take(cap + 1);
      count += rows.filter((row) => row.updatedAt >= freshSince).length;
    }
  }
  return count;
}

/**
 * Reject a new run when the user already has the plan's maximum in progress.
 * Waiting states (columns to approve, a plan to review) don't count, and rows
 * idle for `STALE_RUN_MS` are ignored so a dead run can't block the user.
 */
export async function assertConcurrentRunCapacity(
  ctx: QueryCtx,
  userId: Id<"users">,
  feature: keyof typeof CONCURRENT_RUN_LIMITS,
  isPro: boolean
): Promise<void> {
  const limit = CONCURRENT_RUN_LIMITS[feature][isPro ? "pro" : "free"];
  const active = await countActiveRuns(ctx, userId, feature, limit);
  if (active >= limit) {
    throw createConcurrentRunLimitError(feature, active, limit, isPro);
  }
}

/** Reject a retry once a run has been retried `MAX_RUN_RETRIES` times. */
export function assertRetryAllowed(
  retryCount: number | undefined,
  feature: DailyFeature,
  isPro: boolean
): void {
  const used = retryCount ?? 0;
  if (used >= MAX_RUN_RETRIES) {
    throw createRetryLimitError(feature, used, MAX_RUN_RETRIES, isPro);
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

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, query } from "../_generated/server";
import { getAuthUserId } from "../auth";

// Re-export actions from subscriptions.actions.ts
export {
  cancelAtPeriodEnd,
  checkStripeConfig,
  createCheckoutSession,
  createPortalSession,
  removeCancelAtPeriodEnd,
} from "./actions";

/**
 * Get subscription for the current user (from custom table)
 */
export const get = query({
  args: {},
  returns: v.union(v.null(), v.any()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const subscription = await ctx.db
      .query("stripeSubscriptions")
      .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .first();

    return subscription;
  },
});

/**
 * Get current subscription (alias for get, used by frontend)
 */
export const getCurrent = query({
  args: {},
  returns: v.union(v.null(), v.any()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const subscription = await ctx.db
      .query("stripeSubscriptions")
      .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .first();

    return subscription;
  },
});

/**
 * Check if user has premium subscription
 */
export const isPremium = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const subscription = await ctx.db
      .query("stripeSubscriptions")
      .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .first();

    return !!subscription;
  },
});

// ============ Internal Mutations/Queries ============

/**
 * Internal query to get subscription by user ID
 */
export const getByUserIdInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stripeSubscriptions")
      .withIndex("by_user_and_status", (q) => q.eq("userId", args.userId).eq("status", "active"))
      .first();
  },
});

/**
 * Internal query to get subscription by Stripe subscription ID
 */
export const getByStripeSubscriptionIdInternal = internalQuery({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stripeSubscriptions")
      .withIndex("stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();
  },
});

/**
 * Internal mutation to update cancel at period end
 */
export const updateCancelAtPeriodEndInternal = internalMutation({
  args: {
    stripeSubscriptionId: v.string(),
    cancelAtPeriodEnd: v.boolean(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("stripeSubscriptions")
      .withIndex("stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    await ctx.db.patch(subscription._id, {
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(subscription._id);
  },
});

/**
 * Internal mutation to create or update subscription (called by webhooks)
 */
export const upsertSubscription = internalMutation({
  args: {
    userId: v.id("users"),
    stripeSubscriptionId: v.string(),
    stripeCustomerId: v.string(),
    stripePriceId: v.string(),
    status: v.string(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    interval: v.string(),
    amount: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stripeSubscriptions")
      .withIndex("stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        currentPeriodStart: args.currentPeriodStart,
        currentPeriodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        updatedAt: now,
      });
      return await ctx.db.get(existing._id);
    } else {
      const subscriptionId = await ctx.db.insert("stripeSubscriptions", {
        ...args,
        createdAt: now,
        updatedAt: now,
      });
      return await ctx.db.get(subscriptionId);
    }
  },
});

/**
 * Apply a `customer.subscription.updated` webhook to the stored subscription.
 *
 * Portal- and dashboard-initiated changes fire this event without the metadata
 * we set at checkout, so `userId` / `stripeCustomerId` may be absent. When they
 * are, fall back to the values already stored for this Stripe subscription id.
 * If neither the event nor a stored row can supply them, skip silently rather
 * than dropping a real subscription change on the floor.
 */
export const applyWebhookSubscriptionUpdate = internalMutation({
  args: {
    stripeSubscriptionId: v.string(),
    userId: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripePriceId: v.string(),
    status: v.string(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    interval: v.string(),
    amount: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stripeSubscriptions")
      .withIndex("stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    const userId = (args.userId ?? existing?.userId) as Id<"users"> | undefined;
    const stripeCustomerId = args.stripeCustomerId ?? existing?.stripeCustomerId;

    if (!userId || !stripeCustomerId) {
      // Neither the event nor a stored row can supply the identity. The
      // correlating checkout.session.completed may not have landed yet, so
      // throw and let the webhook layer record the failure and let Stripe
      // retry — a silent return would let the event be marked processed and
      // the change lost for good.
      throw new Error(
        `[Stripe webhook] Could not resolve userId/customerId for subscription.updated (${args.stripeSubscriptionId})`
      );
    }

    const now = Date.now();

    if (existing) {
      // Persist plan-level fields (price / amount / interval / currency) so a
      // portal- or dashboard-initiated plan change is reflected, but only when
      // the event actually carried a price — a sparse event must not clobber
      // the stored plan with empty/zero values.
      const planFields = args.stripePriceId
        ? {
            stripePriceId: args.stripePriceId,
            interval: args.interval,
            amount: args.amount,
            currency: args.currency,
          }
        : {};
      await ctx.db.patch(existing._id, {
        ...planFields,
        status: args.status,
        currentPeriodStart: args.currentPeriodStart,
        currentPeriodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        updatedAt: now,
      });
      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("stripeSubscriptions", {
      userId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripeCustomerId,
      stripePriceId: args.stripePriceId,
      status: args.status,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      interval: args.interval,
      amount: args.amount,
      currency: args.currency,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

/**
 * How long an unprocessed claim is assumed to belong to an in-flight attempt.
 * Comfortably longer than a single webhook action runs (Stripe's own HTTP
 * timeout forces a retry well before this) and shorter than the spacing of
 * Stripe's later automatic retries, so a genuinely stuck claim still ages out
 * and becomes retryable.
 */
const WEBHOOK_IN_FLIGHT_WINDOW_MS = 2 * 60 * 1000;

/**
 * Claim a Stripe webhook event for processing (idempotency guard).
 *
 * Stripe retries deliveries, can send duplicates, and can redeliver an event
 * while a previous (slow) attempt is still running. Returns:
 *  - `{ status: "processed" }` — already fully handled; skip it.
 *  - `{ status: "in_flight" }` — claimed recently by another attempt; the
 *    caller should back off (throw) and let Stripe retry later rather than run
 *    the handlers concurrently.
 *  - `{ status: "new" }` — this attempt owns the event; proceed.
 *
 * For this table `createdAt` records the most recent claim time.
 */
export const claimWebhookEvent = internalMutation({
  args: {
    stripeEventId: v.string(),
    eventType: v.string(),
  },
  returns: v.object({
    status: v.union(v.literal("new"), v.literal("processed"), v.literal("in_flight")),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stripeWebhookEvents")
      .withIndex("stripe_event", (q) => q.eq("stripeEventId", args.stripeEventId))
      .first();

    const now = Date.now();

    if (existing) {
      if (existing.processed) return { status: "processed" as const };
      // A recorded errorMessage means the previous attempt ran to completion
      // (unsuccessfully) and is not in flight — let this delivery retry now.
      // Otherwise, a recent unprocessed claim is assumed to be an in-flight
      // attempt; only a stale one (crashed without recording a failure) is
      // re-claimable.
      const priorAttemptFailed = existing.errorMessage != null;
      if (!priorAttemptFailed && now - existing.createdAt < WEBHOOK_IN_FLIGHT_WINDOW_MS) {
        return { status: "in_flight" as const };
      }
      await ctx.db.patch(existing._id, { createdAt: now, errorMessage: undefined });
      return { status: "new" as const };
    }

    await ctx.db.insert("stripeWebhookEvents", {
      stripeEventId: args.stripeEventId,
      eventType: args.eventType,
      processed: false,
      createdAt: now,
    });
    return { status: "new" as const };
  },
});

/**
 * Mark a Stripe webhook event as fully processed.
 */
export const markWebhookEventProcessed = internalMutation({
  args: { stripeEventId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("stripeWebhookEvents")
      .withIndex("stripe_event", (q) => q.eq("stripeEventId", args.stripeEventId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      processed: true,
      processedAt: Date.now(),
      errorMessage: undefined,
    });
  },
});

/**
 * Record that processing a Stripe webhook event failed. Leaves `processed`
 * false so a later retry of the same event id is allowed to run again.
 */
export const markWebhookEventFailed = internalMutation({
  args: {
    stripeEventId: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("stripeWebhookEvents")
      .withIndex("stripe_event", (q) => q.eq("stripeEventId", args.stripeEventId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, { errorMessage: args.errorMessage });
  },
});

/**
 * Internal mutation to delete subscription (called by webhooks)
 */
export const deleteSubscription = internalMutation({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("stripeSubscriptions")
      .withIndex("stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (!subscription) {
      return { message: "Subscription not found" };
    }

    await ctx.db.delete(subscription._id);
    return { message: "Subscription deleted" };
  },
});

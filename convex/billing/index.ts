import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "../_generated/server";
import { getAuthUserId } from "../auth";

// Re-export actions from subscriptions.actions.ts
export {
  createCheckoutSession,
  createPortalSession,
  cancelAtPeriodEnd,
  removeCancelAtPeriodEnd,
  checkStripeConfig,
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

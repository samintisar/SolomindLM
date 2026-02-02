"use node";

import { v } from "convex/values";
import { action, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { components } from "./_generated/api";
import { StripeSubscriptions } from "@convex-dev/stripe";
import { getAuthUserId } from "./auth";
import type { Doc } from "./_generated/dataModel";

// Initialize Stripe client
const stripeClient = new StripeSubscriptions(components.stripe, {});

// ============ Stripe Actions (using Stripe Component) ============

type Subscription = Doc<"stripeSubscriptions"> | null;

/**
 * Create a Stripe Checkout session for a new subscription
 */
export const createCheckoutSession = action({
  args: {
    interval: v.union(v.literal("month"), v.literal("year")),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Get user identity for email
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No identity found");

    // Get or create Stripe customer
    const customer = await stripeClient.getOrCreateCustomer(ctx, {
      userId: userId,
      email: identity.email ?? undefined,
      name: identity.name ?? undefined,
    });

    // Determine price ID based on interval
    const priceId = args.interval === "month"
      ? process.env.STRIPE_PRO_MONTHLY_PRICE_ID
      : process.env.STRIPE_PRO_YEARLY_PRICE_ID;

    if (!priceId) {
      throw new Error(`Stripe price ID not found for interval: ${args.interval}`);
    }

    // Create checkout session
    const session = await stripeClient.createCheckoutSession(ctx, {
      priceId,
      customerId: customer.customerId,
      mode: "subscription",
      successUrl: args.successUrl,
      cancelUrl: args.cancelUrl,
      subscriptionMetadata: { userId, interval: args.interval },
    });

    return { url: session.url, sessionId: session.sessionId };
  },
});

/**
 * Create a Stripe Customer Portal session
 */
export const createPortalSession = action({
  args: {
    returnUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const subscription = await ctx.runQuery(
      internal.subscriptions.getByUserIdInternal,
      { userId }
    );
    if (!subscription?.stripeCustomerId) {
      throw new Error("No Stripe customer found");
    }

    // Create portal session using Stripe component
    const portalSession = await stripeClient.createCustomerPortalSession(ctx, {
      customerId: subscription.stripeCustomerId,
      returnUrl: args.returnUrl,
    });

    return { url: portalSession.url };
  },
});

/**
 * Cancel subscription at period end (user initiated)
 */
export const cancelAtPeriodEnd = action({
  args: {},
  returns: v.object({
    stripeSubscriptionId: v.string(),
    status: v.string(),
  }),
  handler: async (ctx: ActionCtx): Promise<{
    stripeSubscriptionId: string;
    status: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const subscription: Subscription = await ctx.runQuery(
      internal.subscriptions.getByUserIdInternal,
      { userId }
    );
    if (!subscription) {
      throw new Error("No active subscription found");
    }

    await stripeClient.cancelSubscription(ctx, {
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });

    await ctx.runMutation(internal.subscriptions.updateCancelAtPeriodEndInternal, {
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      cancelAtPeriodEnd: true,
    });

    return {
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      status: subscription.status,
    };
  },
});

/**
 * Remove cancel at period end (reactivate subscription)
 */
export const removeCancelAtPeriodEnd = action({
  args: {},
  returns: v.object({
    stripeSubscriptionId: v.string(),
    status: v.string(),
  }),
  handler: async (ctx: ActionCtx): Promise<{
    stripeSubscriptionId: string;
    status: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const subscription: Subscription = await ctx.runQuery(
      internal.subscriptions.getByUserIdInternal,
      { userId }
    );
    if (!subscription) {
      throw new Error("No subscription scheduled for cancellation found");
    }

    await stripeClient.reactivateSubscription(ctx, {
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });

    await ctx.runMutation(internal.subscriptions.updateCancelAtPeriodEndInternal, {
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      cancelAtPeriodEnd: false,
    });

    return {
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      status: subscription.status,
    };
  },
});

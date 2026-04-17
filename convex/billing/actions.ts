"use node";

import Stripe from "stripe";
import { v } from "convex/values";
import { action, ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { components } from "../_generated/api";
import { StripeSubscriptions } from "@convex-dev/stripe";
import { getAuthUserId } from "../auth";
import type { Doc } from "../_generated/dataModel";

// Initialize Stripe client
const stripeClient = new StripeSubscriptions(components.stripe, {});

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

// ============ Stripe Actions (using Stripe Component) ============

type Subscription = Doc<"stripeSubscriptions"> | null;

/**
 * Check that Stripe-related environment variables are set (for debugging/setup).
 * Returns booleans only; does not expose secret values.
 * Call from Convex Dashboard → Functions or from a dev-only UI.
 */
export const checkStripeConfig = action({
  args: {},
  returns: v.object({
    stripeSecretKeySet: v.boolean(),
    stripeWebhookSecretSet: v.boolean(),
    monthlyPriceIdSet: v.boolean(),
    yearlyPriceIdSet: v.boolean(),
    allSet: v.boolean(),
  }),
  handler: async () => {
    const stripeSecretKeySet = !!process.env.STRIPE_SECRET_KEY;
    const stripeWebhookSecretSet = !!process.env.STRIPE_WEBHOOK_SECRET;
    const monthlyPriceIdSet = !!process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    const yearlyPriceIdSet = !!process.env.STRIPE_PRO_YEARLY_PRICE_ID;
    const allSet =
      stripeSecretKeySet &&
      stripeWebhookSecretSet &&
      monthlyPriceIdSet &&
      yearlyPriceIdSet;
    return {
      stripeSecretKeySet,
      stripeWebhookSecretSet,
      monthlyPriceIdSet,
      yearlyPriceIdSet,
      allSet,
    };
  },
});

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

    // Determine price ID based on interval (check before calling Stripe)
    const rawPriceId =
      args.interval === "month"
        ? process.env.STRIPE_PRO_MONTHLY_PRICE_ID
        : process.env.STRIPE_PRO_YEARLY_PRICE_ID;
    const priceId = rawPriceId?.trim();

    if (!priceId) {
      const varName =
        args.interval === "month"
          ? "STRIPE_PRO_MONTHLY_PRICE_ID"
          : "STRIPE_PRO_YEARLY_PRICE_ID";
      throw new Error(
        `Stripe price ID not configured. Set ${varName} in Convex Dashboard → Settings → Environment Variables (use a Stripe Price ID e.g. price_xxx).`
      );
    }

    const createSessionWithCustomer = async (customerId: string) =>
      stripeClient.createCheckoutSession(ctx, {
        priceId,
        customerId,
        mode: "subscription",
        successUrl: args.successUrl,
        cancelUrl: args.cancelUrl,
        subscriptionMetadata: { userId, interval: args.interval },
      });

    try {
      const customer = await stripeClient.getOrCreateCustomer(ctx, {
        userId: userId,
        email: identity.email ?? undefined,
        name: identity.name ?? undefined,
      });

      const session = await createSessionWithCustomer(customer.customerId);
      return { url: session.url, sessionId: session.sessionId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      // Stored customer ID is stale (e.g. after switching Stripe key/mode). Create a new customer and retry once.
      if (message.includes("No such customer")) {
        try {
          const stripe = getStripeClient();
          const newCustomer = await stripe.customers.create({
            email: identity.email ?? undefined,
            name: identity.name ?? undefined,
            metadata: { convexUserId: userId },
          });
          const session = await createSessionWithCustomer(newCustomer.id);
          return { url: session.url, sessionId: session.sessionId };
        } catch (retryErr: unknown) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          throw new Error(
            `Stripe customer not found and retry failed. ${retryMsg}`,
            { cause: retryErr }
          );
        }
      }

      // Stripe "No such price" = price ID not in this account or test/live mismatch
      if (message.includes("No such price") || (err as { code?: string })?.code === "resource_missing") {
        const varName =
          args.interval === "month"
            ? "STRIPE_PRO_MONTHLY_PRICE_ID"
            : "STRIPE_PRO_YEARLY_PRICE_ID";
        throw new Error(
          `Invalid Stripe price. Update ${varName} in Convex to a Price ID from the same Stripe account and mode (test vs live) as your STRIPE_SECRET_KEY. In Stripe Dashboard → Products, copy the correct price_xxx. Stripe: ${message}`,
          { cause: err }
        );
      }
      throw err;
    }
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
      internal.billing.index.getByUserIdInternal,
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
      internal.billing.index.getByUserIdInternal,
      { userId }
    );
    if (!subscription) {
      throw new Error("No active subscription found");
    }

    await stripeClient.cancelSubscription(ctx, {
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });

    await ctx.runMutation(internal.billing.index.updateCancelAtPeriodEndInternal, {
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
      internal.billing.index.getByUserIdInternal,
      { userId }
    );
    if (!subscription) {
      throw new Error("No subscription scheduled for cancellation found");
    }

    await stripeClient.reactivateSubscription(ctx, {
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });

    await ctx.runMutation(internal.billing.index.updateCancelAtPeriodEndInternal, {
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      cancelAtPeriodEnd: false,
    });

    return {
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      status: subscription.status,
    };
  },
});

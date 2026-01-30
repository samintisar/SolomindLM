"use node";

import Stripe from "stripe";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { components } from "./_generated/api";

export const handleWebhook = internalAction({
  args: {
    signature: v.string(),
    payload: v.string(),
  },
  handler: async (ctx, { signature, payload }) => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-01-28.clover",
    });

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    try {
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
      );

      console.log(`[Stripe webhook] Event type: ${event.type}, ID: ${event.id}`);

      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(ctx, event);
          break;

        case "customer.subscription.updated":
          await handleSubscriptionUpdated(ctx, event);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(ctx, event);
          break;

        case "invoice.paid":
          await handleInvoicePaid(ctx, event);
          break;

        default:
          console.log(`[Stripe webhook] Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error("[Stripe webhook] Error processing event:", error);
      throw error;
    }
  },
});

async function handleCheckoutCompleted(ctx: ActionCtx, event: { data: { object: any } }) {
  const session = event.data.object;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  const userId = session.metadata?.userId;
  const interval = session.metadata?.interval;

  if (!subscriptionId || !customerId || !userId) {
    console.error("[Stripe webhook] Missing required data in checkout.session.completed");
    return;
  }

  if (!interval) {
    console.warn("[Stripe webhook] Missing interval in checkout session metadata, defaulting to 'month'");
  }

  const subscription = await ctx.runQuery(
    components.stripe.public.getSubscription,
    { stripeSubscriptionId: subscriptionId }
  );

  if (!subscription) {
    console.error("[Stripe webhook] Subscription not found in component data");
    return;
  }

  const priceId = subscription.priceId;

  await ctx.runMutation(internal.subscriptions.upsertSubscription, {
    userId,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    stripePriceId: priceId,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodEnd
      ? subscription.currentPeriodEnd - (subscription.status === "active" ? 2592000000 : 0)
      : Date.now(),
    currentPeriodEnd: subscription.currentPeriodEnd || Date.now() + 2592000000,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
    interval: (interval as string) || "month",
    amount: subscription.quantity ? subscription.quantity * 1000 : 1000,
    currency: "usd",
  });
}

async function handleSubscriptionUpdated(ctx: ActionCtx, event: { data: { object: any } }) {
  const raw = event.data.object as any & {
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end?: boolean;
  };
  const subscriptionId = raw.id;
  const customerId = typeof raw.customer === "string" ? raw.customer : raw.customer?.id;
  const userId = raw.metadata?.userId;

  if (!userId || !customerId) {
    console.error("[Stripe webhook] Missing userId or customerId in subscription.updated");
    return;
  }

  const componentSubscription = await ctx.runQuery(
    components.stripe.public.getSubscription,
    { stripeSubscriptionId: subscriptionId }
  );

  if (!componentSubscription) {
    console.error("[Stripe webhook] Subscription not found in component data");
    return;
  }

  await ctx.runMutation(internal.subscriptions.upsertSubscription, {
    userId,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    stripePriceId: componentSubscription.priceId,
    status: raw.status,
    currentPeriodStart: raw.current_period_start * 1000,
    currentPeriodEnd: raw.current_period_end * 1000,
    cancelAtPeriodEnd: raw.cancel_at_period_end || false,
    interval: (raw.items?.data?.[0]?.price?.recurring?.interval as string) || "month",
    amount: raw.items?.data?.[0]?.price?.unit_amount || 0,
    currency: (raw.items?.data?.[0]?.price?.currency as string) || "usd",
  });
}

async function handleSubscriptionDeleted(ctx: ActionCtx, event: { data: { object: any } }) {
  const subscription = event.data.object as any;
  const subscriptionId = subscription.id;

  await ctx.runMutation(internal.subscriptions.deleteSubscription, {
    stripeSubscriptionId: subscriptionId,
  });
}

async function handleInvoicePaid(ctx: ActionCtx, event: { data: { object: any } }) {
  const invoice = event.data.object as any & {
    subscription?: string | { id: string };
    amount_paid?: number;
    currency?: string;
  };
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!subscriptionId) return;

  const existing = await ctx.runQuery(
    components.stripe.public.getSubscription,
    { stripeSubscriptionId: subscriptionId }
  );

  if (!existing?.userId) return;

  await ctx.runMutation(internal.subscriptions.upsertSubscription, {
    userId: existing.userId,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId:
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id || "",
    stripePriceId: existing.priceId,
    status: existing.status,
    currentPeriodStart: existing.currentPeriodEnd
      ? existing.currentPeriodEnd - 2592000000
      : Date.now(),
    currentPeriodEnd: existing.currentPeriodEnd || Date.now() + 2592000000,
    cancelAtPeriodEnd: existing.cancelAtPeriodEnd || false,
    interval: "month",
    amount: invoice.amount_paid ?? 0,
    currency: invoice.currency ?? "usd",
  });
}

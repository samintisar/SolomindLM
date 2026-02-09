"use node";

import Stripe from "stripe";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";

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
          await handleCheckoutCompleted(ctx, event, stripe);
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

async function handleCheckoutCompleted(
  ctx: ActionCtx,
  event: { data: { object: any } },
  stripe: Stripe
) {
  const session = event.data.object;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  // Fetch subscription from Stripe API first. We set subscriptionMetadata when
  // creating checkout (subscription_data.metadata), so userId/interval live
  // on the subscription, not on the session.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
  let userId =
    subscription.metadata?.userId ??
    session.metadata?.userId ??
    (session.client_reference_id as string | undefined);

  // Fallback: resolve userId from Stripe customer metadata (e.g. convexUserId) if component or session didn't pass it
  if (!userId && customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      // Check if customer is not deleted before accessing metadata
      if ('deleted' in customer && !customer.deleted && 'metadata' in customer && customer.metadata?.convexUserId) {
        userId = customer.metadata.convexUserId;
        console.log("[Stripe webhook] Resolved userId from customer metadata:", userId);
      }
    } catch (e) {
      console.warn("[Stripe webhook] Could not retrieve customer for userId fallback:", e);
    }
  }

  const interval = subscription.metadata?.interval ?? session.metadata?.interval;

  if (!subscriptionId || !customerId || !userId) {
    console.error("[Stripe webhook] Missing required data in checkout.session.completed", {
      hasSubscriptionId: !!subscriptionId,
      hasCustomerId: !!customerId,
      hasUserId: !!userId,
    });
    return;
  }

  if (!interval) {
    console.warn("[Stripe webhook] Missing interval in checkout session metadata, defaulting to 'month'");
  }

  const item = subscription.items.data[0];
  const price = item?.price;
  const priceId = price?.id ?? "";
  const amount = (price && "unit_amount" in price ? price.unit_amount : 0) ?? 0;
  const currency = (price && "currency" in price ? price.currency : "usd") ?? "usd";
  const intervalFromPrice =
    (price && typeof price === "object" && "recurring" in price && price.recurring?.interval)
      ? (price.recurring as { interval: string }).interval
      : (interval as string) || "month";

  // Stripe API returns snake_case; SDK types may use different names. Read period from retrieved object.
  const sub = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
    status?: string;
    cancel_at_period_end?: boolean;
  };
  const periodStartSec = sub.current_period_start ?? 0;
  let periodEndSec = sub.current_period_end ?? 0;
  if (!periodEndSec && periodStartSec) {
    const isYearly = intervalFromPrice === "year";
    periodEndSec =
      periodStartSec + (isYearly ? 365 * 24 * 60 * 60 : 31 * 24 * 60 * 60);
  }
  const subStatus = sub.status ?? "active";
  const cancelAtPeriodEnd = sub.cancel_at_period_end ?? false;

  await ctx.runMutation(internal.subscriptions.upsertSubscription, {
    userId: userId as any,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    stripePriceId: priceId,
    status: subStatus,
    currentPeriodStart: periodStartSec * 1000,
    currentPeriodEnd: periodEndSec * 1000,
    cancelAtPeriodEnd,
    interval: intervalFromPrice,
    amount,
    currency,
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

  const priceId = raw.items?.data?.[0]?.price?.id ?? "";
  const amount = raw.items?.data?.[0]?.price?.unit_amount ?? 0;
  const currency = (raw.items?.data?.[0]?.price?.currency as string) ?? "usd";
  const interval = (raw.items?.data?.[0]?.price?.recurring?.interval as string) ?? "month";

  await ctx.runMutation(internal.subscriptions.upsertSubscription, {
    userId: userId as any,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    stripePriceId: priceId,
    status: raw.status,
    currentPeriodStart: raw.current_period_start * 1000,
    currentPeriodEnd: raw.current_period_end * 1000,
    cancelAtPeriodEnd: raw.cancel_at_period_end ?? false,
    interval,
    amount,
    currency,
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
    customer?: string | { id: string };
  };
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!subscriptionId) return;

  // Resolve userId from our stripeSubscriptions table (we don't use the component DB).
  const existing = await ctx.runQuery(
    internal.subscriptions.getByStripeSubscriptionIdInternal,
    { stripeSubscriptionId: subscriptionId }
  );

  if (!existing?.userId) return;

  const stripeCustomerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer as { id: string })?.id ?? "";

  await ctx.runMutation(internal.subscriptions.upsertSubscription, {
    userId: existing.userId,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId,
    stripePriceId: existing.stripePriceId,
    status: existing.status,
    currentPeriodStart: existing.currentPeriodStart,
    currentPeriodEnd: existing.currentPeriodEnd,
    cancelAtPeriodEnd: existing.cancelAtPeriodEnd,
    interval: existing.interval,
    amount: invoice.amount_paid ?? 0,
    currency: invoice.currency ?? "usd",
  });
}

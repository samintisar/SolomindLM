"use node";

import { v } from "convex/values";
import Stripe from "stripe";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";

export const handleWebhook = internalAction({
  args: {
    signature: v.string(),
    payload: v.string(),
  },
  handler: async (ctx, { signature, payload }) => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-02-25.clover",
    });

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    console.log(`[Stripe webhook] Event type: ${event.type}, ID: ${event.id}`);

    // Idempotency: Stripe retries deliveries, sends duplicates, and can
    // redeliver while a previous attempt is still running.
    const { status } = await ctx.runMutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: event.id,
      eventType: event.type,
    });
    if (status === "processed") {
      console.log(`[Stripe webhook] Duplicate event ${event.id}, skipping`);
      return;
    }
    if (status === "in_flight") {
      // Another delivery of this event is being handled right now. Fail so
      // Stripe retries later instead of running the handlers concurrently.
      throw new Error(`[Stripe webhook] Event ${event.id} already in flight, retry later`);
    }

    try {
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

      await ctx.runMutation(internal.billing.index.markWebhookEventProcessed, {
        stripeEventId: event.id,
      });
    } catch (error) {
      console.error("[Stripe webhook] Error processing event:", error);
      await ctx.runMutation(internal.billing.index.markWebhookEventFailed, {
        stripeEventId: event.id,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
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
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

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
      if (
        "deleted" in customer &&
        !customer.deleted &&
        "metadata" in customer &&
        customer.metadata?.convexUserId
      ) {
        userId = customer.metadata.convexUserId;
        console.log("[Stripe webhook] Resolved userId from customer metadata:", userId);
      }
    } catch (e) {
      console.warn("[Stripe webhook] Could not retrieve customer for userId fallback:", e);
    }
  }

  const interval = subscription.metadata?.interval ?? session.metadata?.interval;

  if (!subscriptionId || !customerId) {
    // Not a subscription checkout (or a malformed session) — nothing to store,
    // and retrying will not change that.
    console.log(
      "[Stripe webhook] checkout.session.completed without subscription/customer, ignoring",
      { hasSubscriptionId: !!subscriptionId, hasCustomerId: !!customerId }
    );
    return;
  }

  if (!userId) {
    // We have a paid subscription but cannot map it to a user yet (checkout
    // metadata / customer.convexUserId may still be propagating). Throw so the
    // webhook layer records the failure and Stripe retries rather than marking
    // this event permanently processed.
    throw new Error(
      `[Stripe webhook] checkout.session.completed could not resolve userId for subscription ${subscriptionId}`
    );
  }

  if (!interval) {
    console.warn(
      "[Stripe webhook] Missing interval in checkout session metadata, defaulting to 'month'"
    );
  }

  const item = subscription.items.data[0];
  const price = item?.price;
  const priceId = price?.id ?? "";
  const amount = (price && "unit_amount" in price ? price.unit_amount : 0) ?? 0;
  const currency = (price && "currency" in price ? price.currency : "usd") ?? "usd";
  const intervalFromPrice =
    price && typeof price === "object" && "recurring" in price && price.recurring?.interval
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
    periodEndSec = periodStartSec + (isYearly ? 365 * 24 * 60 * 60 : 31 * 24 * 60 * 60);
  }
  const subStatus = sub.status ?? "active";
  const cancelAtPeriodEnd = sub.cancel_at_period_end ?? false;

  await ctx.runMutation(internal.billing.index.upsertSubscription, {
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
  // Portal- and dashboard-initiated updates don't carry the metadata we set at
  // checkout. applyWebhookSubscriptionUpdate resolves a missing userId/customerId
  // from the stored subscription row.
  const userId = raw.metadata?.userId as string | undefined;

  const priceId = raw.items?.data?.[0]?.price?.id ?? "";
  const amount = raw.items?.data?.[0]?.price?.unit_amount ?? 0;
  const currency = (raw.items?.data?.[0]?.price?.currency as string) ?? "usd";
  const interval = (raw.items?.data?.[0]?.price?.recurring?.interval as string) ?? "month";

  await ctx.runMutation(internal.billing.index.applyWebhookSubscriptionUpdate, {
    stripeSubscriptionId: subscriptionId,
    userId,
    stripeCustomerId: typeof customerId === "string" ? customerId : undefined,
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

  await ctx.runMutation(internal.billing.index.deleteSubscription, {
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
    typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;

  if (!subscriptionId) return;

  // Resolve userId from our stripeSubscriptions table (we don't use the component DB).
  const existing = await ctx.runQuery(internal.billing.index.getByStripeSubscriptionIdInternal, {
    stripeSubscriptionId: subscriptionId,
  });

  if (!existing?.userId) {
    // The subscription row is not in our table yet — the correlating
    // checkout.session.completed may not have been processed. Throw so Stripe
    // retries this invoice.paid instead of it being marked processed and lost.
    throw new Error(
      `[Stripe webhook] invoice.paid for unknown subscription ${subscriptionId}, retrying`
    );
  }

  const stripeCustomerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : ((invoice.customer as { id: string })?.id ?? "");

  await ctx.runMutation(internal.billing.index.upsertSubscription, {
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

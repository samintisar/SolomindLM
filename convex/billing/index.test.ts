/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

async function seedUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}

async function seedSubscription(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  overrides: Partial<{
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    status: string;
    amount: number;
    currentPeriodEnd: number;
  }> = {}
): Promise<Id<"stripeSubscriptions">> {
  const now = Date.now();
  return t.run(async (ctx) =>
    ctx.db.insert("stripeSubscriptions", {
      userId,
      stripeSubscriptionId: overrides.stripeSubscriptionId ?? "sub_seed",
      stripeCustomerId: overrides.stripeCustomerId ?? "cus_seed",
      stripePriceId: "price_seed",
      status: overrides.status ?? "active",
      currentPeriodStart: now,
      currentPeriodEnd: overrides.currentPeriodEnd ?? now + 30 * 24 * 60 * 60 * 1000,
      cancelAtPeriodEnd: false,
      interval: "month",
      amount: overrides.amount ?? 1500,
      currency: "usd",
      createdAt: now,
      updatedAt: now,
    })
  );
}

const UPDATE_FIELDS = {
  stripePriceId: "price_new",
  status: "past_due",
  currentPeriodStart: 1_700_000_000_000,
  currentPeriodEnd: 1_702_000_000_000,
  cancelAtPeriodEnd: true,
  interval: "month",
  amount: 1500,
  currency: "usd",
};

describe("webhook idempotency", () => {
  test("claimWebhookEvent records a new event and reports it as unprocessed", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: "evt_1",
      eventType: "customer.subscription.updated",
    });

    expect(result).toEqual({ status: "new" });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("stripeWebhookEvents")
        .withIndex("stripe_event", (q) => q.eq("stripeEventId", "evt_1"))
        .first()
    );
    expect(row?.eventType).toBe("customer.subscription.updated");
    expect(row?.processed).toBe(false);
  });

  test("claimWebhookEvent reports alreadyProcessed once the event is marked processed", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: "evt_dup",
      eventType: "invoice.paid",
    });
    await t.mutation(internal.billing.index.markWebhookEventProcessed, {
      stripeEventId: "evt_dup",
    });

    const second = await t.mutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: "evt_dup",
      eventType: "invoice.paid",
    });

    expect(second).toEqual({ status: "processed" });
  });

  test("claimWebhookEvent reports a fresh unprocessed claim as in_flight (concurrent redelivery)", async () => {
    const t = convexTest(schema, modules);

    const first = await t.mutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: "evt_retry",
      eventType: "invoice.paid",
    });
    expect(first).toEqual({ status: "new" });

    // A second delivery of the same event arrives while the first attempt is
    // still running — do not run the handlers again concurrently.
    const second = await t.mutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: "evt_retry",
      eventType: "invoice.paid",
    });
    expect(second).toEqual({ status: "in_flight" });

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("stripeWebhookEvents")
        .withIndex("stripe_event", (q) => q.eq("stripeEventId", "evt_retry"))
        .collect()
    );
    expect(rows).toHaveLength(1);
  });

  test("claimWebhookEvent allows an immediate retry once a failure has been recorded", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: "evt_failed_then_retry",
      eventType: "invoice.paid",
    });
    await t.mutation(internal.billing.index.markWebhookEventFailed, {
      stripeEventId: "evt_failed_then_retry",
      errorMessage: "transient",
    });

    // A recorded failure means the prior attempt is finished (not in flight),
    // so Stripe's retry may run again without waiting out the in-flight window.
    const retry = await t.mutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: "evt_failed_then_retry",
      eventType: "invoice.paid",
    });
    expect(retry).toEqual({ status: "new" });
  });

  test("claimWebhookEvent allows a retry once a stale unprocessed claim has aged out", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: "evt_stale",
      eventType: "invoice.paid",
    });

    // Simulate a prior attempt that crashed hard (no failure recorded) well
    // outside the in-flight window.
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("stripe_event", (q) => q.eq("stripeEventId", "evt_stale"))
        .first();
      if (row) await ctx.db.patch(row._id, { createdAt: Date.now() - 60 * 60 * 1000 });
    });

    const second = await t.mutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: "evt_stale",
      eventType: "invoice.paid",
    });
    expect(second).toEqual({ status: "new" });
  });

  test("markWebhookEventProcessed sets processed and a processedAt timestamp", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: "evt_ok",
      eventType: "invoice.paid",
    });
    await t.mutation(internal.billing.index.markWebhookEventProcessed, {
      stripeEventId: "evt_ok",
    });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("stripeWebhookEvents")
        .withIndex("stripe_event", (q) => q.eq("stripeEventId", "evt_ok"))
        .first()
    );
    expect(row?.processed).toBe(true);
    expect(typeof row?.processedAt).toBe("number");
  });

  test("markWebhookEventFailed records the error message and leaves the event unprocessed", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: "evt_fail",
      eventType: "invoice.paid",
    });
    await t.mutation(internal.billing.index.markWebhookEventFailed, {
      stripeEventId: "evt_fail",
      errorMessage: "boom",
    });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("stripeWebhookEvents")
        .withIndex("stripe_event", (q) => q.eq("stripeEventId", "evt_fail"))
        .first()
    );
    expect(row?.processed).toBe(false);
    expect(row?.errorMessage).toBe("boom");
  });
});

describe("applyWebhookSubscriptionUpdate", () => {
  test("updates the stored subscription when metadata carries the userId", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedSubscription(t, userId, { stripeSubscriptionId: "sub_meta", status: "active" });

    await t.mutation(internal.billing.index.applyWebhookSubscriptionUpdate, {
      stripeSubscriptionId: "sub_meta",
      userId: userId as string,
      stripeCustomerId: "cus_meta",
      ...UPDATE_FIELDS,
    });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("stripeSubscriptions")
        .withIndex("stripe_subscription", (q) => q.eq("stripeSubscriptionId", "sub_meta"))
        .first()
    );
    expect(row?.status).toBe("past_due");
    expect(row?.cancelAtPeriodEnd).toBe(true);
    expect(row?.currentPeriodEnd).toBe(UPDATE_FIELDS.currentPeriodEnd);
  });

  test("persists a plan change (price, amount, interval, currency) onto the stored row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedSubscription(t, userId, {
      stripeSubscriptionId: "sub_planchange",
      status: "active",
      amount: 1500,
    });

    // User switches from a $15/mo plan to a $144/yr plan via the customer portal.
    await t.mutation(internal.billing.index.applyWebhookSubscriptionUpdate, {
      stripeSubscriptionId: "sub_planchange",
      userId: userId as string,
      stripeCustomerId: "cus_planchange",
      stripePriceId: "price_yearly",
      status: "active",
      currentPeriodStart: UPDATE_FIELDS.currentPeriodStart,
      currentPeriodEnd: UPDATE_FIELDS.currentPeriodEnd,
      cancelAtPeriodEnd: false,
      interval: "year",
      amount: 14400,
      currency: "eur",
    });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("stripeSubscriptions")
        .withIndex("stripe_subscription", (q) => q.eq("stripeSubscriptionId", "sub_planchange"))
        .first()
    );
    expect(row?.stripePriceId).toBe("price_yearly");
    expect(row?.amount).toBe(14400);
    expect(row?.interval).toBe("year");
    expect(row?.currency).toBe("eur");
  });

  test("falls back to the stored row's userId when the event has no metadata", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedSubscription(t, userId, { stripeSubscriptionId: "sub_nometa", status: "active" });

    await t.mutation(internal.billing.index.applyWebhookSubscriptionUpdate, {
      stripeSubscriptionId: "sub_nometa",
      // no userId, no stripeCustomerId — a portal/dashboard-initiated update
      ...UPDATE_FIELDS,
    });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("stripeSubscriptions")
        .withIndex("stripe_subscription", (q) => q.eq("stripeSubscriptionId", "sub_nometa"))
        .first()
    );
    expect(row?.userId).toBe(userId);
    expect(row?.status).toBe("past_due");
  });

  test("throws (so Stripe retries) when it cannot resolve a user and no row exists", async () => {
    const t = convexTest(schema, modules);

    // No metadata on the event and no stored subscription: the correlating
    // checkout.session.completed may simply not have landed yet. Silently
    // dropping this (and letting the caller mark the event processed) would
    // lose the change permanently, so the mutation must fail loudly.
    await expect(
      t.mutation(internal.billing.index.applyWebhookSubscriptionUpdate, {
        stripeSubscriptionId: "sub_unknown",
        ...UPDATE_FIELDS,
      })
    ).rejects.toThrow();

    const rows = await t.run(async (ctx) => ctx.db.query("stripeSubscriptions").collect());
    expect(rows).toHaveLength(0);
  });
});

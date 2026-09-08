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

    expect(result).toEqual({ alreadyProcessed: false });

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

    expect(second).toEqual({ alreadyProcessed: true });
  });

  test("claimWebhookEvent allows a retry when a prior attempt never completed", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: "evt_retry",
      eventType: "invoice.paid",
    });

    const second = await t.mutation(internal.billing.index.claimWebhookEvent, {
      stripeEventId: "evt_retry",
      eventType: "invoice.paid",
    });

    expect(second).toEqual({ alreadyProcessed: false });

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("stripeWebhookEvents")
        .withIndex("stripe_event", (q) => q.eq("stripeEventId", "evt_retry"))
        .collect()
    );
    expect(rows).toHaveLength(1);
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

  test("is a no-op when there is no metadata and no stored subscription", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.billing.index.applyWebhookSubscriptionUpdate, {
      stripeSubscriptionId: "sub_unknown",
      ...UPDATE_FIELDS,
    });

    const rows = await t.run(async (ctx) => ctx.db.query("stripeSubscriptions").collect());
    expect(rows).toHaveLength(0);
  });
});

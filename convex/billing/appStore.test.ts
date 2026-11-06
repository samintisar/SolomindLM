/// <reference types="vite/client" />
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { isProUser } from "../_lib/limits";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";
import type { VerifiedTransaction } from "./appStoreModel";
import { APP_STORE_PRODUCTS } from "./appStoreProducts";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./billing/index.ts", "./billing/appStore.ts"]);

const DAY = 24 * 60 * 60 * 1000;

type T = ReturnType<typeof convexTest>;

async function seedUser(t: T): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}

async function seedAppStoreSubscription(
  t: T,
  userId: Id<"users">,
  overrides: Partial<{
    originalTransactionId: string;
    status: "active" | "grace" | "billing_retry" | "expired" | "revoked";
    expiresAt: number;
    gracePeriodExpiresAt: number;
    productId: string;
  }> = {}
) {
  const now = Date.now();
  return t.run(async (ctx) =>
    ctx.db.insert("appStoreSubscriptions", {
      userId,
      originalTransactionId: overrides.originalTransactionId ?? "1000000000000001",
      latestTransactionId: "2000000000000001",
      productId: overrides.productId ?? APP_STORE_PRODUCTS.monthly,
      environment: "Sandbox",
      status: overrides.status ?? "active",
      expiresAt: overrides.expiresAt ?? now + 30 * DAY,
      ...(overrides.gracePeriodExpiresAt !== undefined
        ? { gracePeriodExpiresAt: overrides.gracePeriodExpiresAt }
        : {}),
      autoRenews: true,
      createdAt: now,
      updatedAt: now,
    })
  );
}

describe("isProUser", () => {
  test("an active App Store subscription is Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId);
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("an expired App Store subscription is not Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId, { status: "expired" });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(false);
  });

  test("an 'active' row long past expiry is not Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId, { expiresAt: Date.now() - 3 * DAY });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(false);
  });

  test("a user with neither store is not Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(false);
  });
});

describe("isProUser with several rows", () => {
  test("an expired row and an active row for one user is Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId, {
      originalTransactionId: "1000000000000009",
      status: "expired",
      expiresAt: Date.now() - 60 * DAY,
    });
    await seedAppStoreSubscription(t, userId, { originalTransactionId: "1000000000000010" });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });
});

function asUser(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

function transaction(overrides: Partial<VerifiedTransaction> = {}): VerifiedTransaction {
  return {
    environment: "Sandbox" as const,
    originalTransactionId: "1000000000000001",
    transactionId: "2000000000000001",
    productId: APP_STORE_PRODUCTS.monthly,
    expiresAt: Date.now() + 30 * DAY,
    ...overrides,
  };
}

describe("getAccountToken", () => {
  test("creates one token per user and returns it again", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const first = await asUser(t, userId).mutation(api.billing.appStore.getAccountToken, {});
    const second = await asUser(t, userId).mutation(api.billing.appStore.getAccountToken, {});
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });

  test("rejects signed-out callers", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.billing.appStore.getAccountToken, {})).rejects.toThrow();
  });
});

describe("applyVerifiedTransaction", () => {
  test("creates an active subscription for the caller", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const token = await asUser(t, userId).mutation(api.billing.appStore.getAccountToken, {});
    const result = await t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
      userId,
      transaction: transaction({ appAccountToken: token }),
    });
    expect(result).toEqual({ status: "active" });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("rejects a token that belongs to another account", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t);
    const other = await seedUser(t);
    const token = await asUser(t, owner).mutation(api.billing.appStore.getAccountToken, {});
    await expect(
      t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
        userId: other,
        transaction: transaction({ appAccountToken: token }),
      })
    ).rejects.toThrow(/linked to another SolomindLM account/);
  });

  test("rejects a subscription already stored for another account", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t);
    const other = await seedUser(t);
    await seedAppStoreSubscription(t, owner);
    await expect(
      t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
        userId: other,
        transaction: transaction(),
      })
    ).rejects.toThrow(/linked to another SolomindLM account/);
  });

  test("accepts a token no account owns (its account was deleted)", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const result = await t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
      userId,
      transaction: transaction({ appAccountToken: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(result).toEqual({ status: "active" });
  });

  test("an older transaction does not roll back a newer expiry", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const later = Date.now() + 60 * DAY;
    await seedAppStoreSubscription(t, userId, { expiresAt: later });
    await t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
      userId,
      transaction: transaction({ expiresAt: Date.now() + DAY }),
    });
    const row = await t.run((ctx) => ctx.db.query("appStoreSubscriptions").first());
    expect(row?.expiresAt).toBe(later);
    expect(row?.status).toBe("active");
    expect(row?.latestTransactionId).toBe("2000000000000001");
  });

  test("syncing a later transaction renews an expired row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId, { status: "expired", expiresAt: Date.now() - DAY });
    const result = await t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
      userId,
      transaction: transaction({ transactionId: "2000000000000002" }),
    });
    expect(result).toEqual({ status: "active" });
    const row = await t.run((ctx) => ctx.db.query("appStoreSubscriptions").first());
    expect(row?.latestTransactionId).toBe("2000000000000002");
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("a replayed pre-refund transaction does not undo a revoked row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const expiresAt = Date.now() + 10 * DAY;
    await seedAppStoreSubscription(t, userId, { status: "revoked", expiresAt });
    const result = await t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
      userId,
      transaction: transaction({ expiresAt }),
    });
    expect(result).toEqual({ status: "revoked" });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(false);
  });

  test("a lapsed row on a shared Apple ID moves to the new token owner", async () => {
    const t = convexTest(schema, modules);
    const a = await seedUser(t);
    const b = await seedUser(t);
    await seedAppStoreSubscription(t, a, { status: "expired", expiresAt: Date.now() - 10 * DAY });
    const token = await asUser(t, b).mutation(api.billing.appStore.getAccountToken, {});
    const result = await t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
      userId: b,
      transaction: transaction({ appAccountToken: token }),
    });
    expect(result).toEqual({ status: "active" });
    const row = await t.run((ctx) => ctx.db.query("appStoreSubscriptions").first());
    expect(row?.userId).toBe(b);
    expect(await t.run((ctx) => isProUser(ctx, b))).toBe(true);
    expect(await t.run((ctx) => isProUser(ctx, a))).toBe(false);
  });

  test("an entitled row is not taken over by another token owner", async () => {
    const t = convexTest(schema, modules);
    const a = await seedUser(t);
    const b = await seedUser(t);
    await seedAppStoreSubscription(t, a);
    const token = await asUser(t, b).mutation(api.billing.appStore.getAccountToken, {});
    await expect(
      t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
        userId: b,
        transaction: transaction({ appAccountToken: token }),
      })
    ).rejects.toThrow(/linked to another SolomindLM account/);
  });

  test("an expired transaction keeps a grace status from notifications", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId, {
      status: "grace",
      expiresAt: Date.now() - 2 * DAY,
      gracePeriodExpiresAt: Date.now() + 5 * DAY,
    });
    const result = await t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
      userId,
      transaction: transaction({ expiresAt: Date.now() - 2 * DAY }),
    });
    expect(result).toEqual({ status: "grace" });
  });
});

describe("notifications", () => {
  test("claim → processed → duplicate", async () => {
    const t = convexTest(schema, modules);
    const args = { notificationUUID: "n-1", notificationType: "DID_RENEW" };
    expect(await t.mutation(internal.billing.appStore.claimNotification, args)).toEqual({
      status: "new",
    });
    expect(await t.mutation(internal.billing.appStore.claimNotification, args)).toEqual({
      status: "in_flight",
    });
    await t.mutation(internal.billing.appStore.markNotificationProcessed, {
      notificationUUID: "n-1",
    });
    expect(await t.mutation(internal.billing.appStore.claimNotification, args)).toEqual({
      status: "processed",
    });
  });

  test("a failed attempt can be claimed again right away", async () => {
    const t = convexTest(schema, modules);
    const args = { notificationUUID: "n-2", notificationType: "DID_RENEW" };
    await t.mutation(internal.billing.appStore.claimNotification, args);
    await t.mutation(internal.billing.appStore.markNotificationFailed, {
      notificationUUID: "n-2",
      errorMessage: "boom",
    });
    expect(await t.mutation(internal.billing.appStore.claimNotification, args)).toEqual({
      status: "new",
    });
  });

  test("DID_FAIL_TO_RENEW with GRACE_PERIOD keeps Pro until the grace deadline", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const expiresAt = Date.now() - DAY;
    await seedAppStoreSubscription(t, userId, { expiresAt });
    const result = await t.mutation(internal.billing.appStore.applyNotification, {
      notificationUUID: "n-test",
      notificationType: "DID_FAIL_TO_RENEW",
      subtype: "GRACE_PERIOD",
      transaction: transaction({ expiresAt }),
      renewal: { autoRenews: true, gracePeriodExpiresAt: Date.now() + 5 * DAY },
    });
    expect(result).toEqual({ applied: true });
    const row = await t.run((ctx) => ctx.db.query("appStoreSubscriptions").first());
    expect(row?.status).toBe("grace");
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("REFUND revokes Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId);
    await t.mutation(internal.billing.appStore.applyNotification, {
      notificationUUID: "n-test",
      notificationType: "REFUND",
      transaction: transaction({ revokedAt: Date.now() }),
    });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(false);
  });

  test("DID_CHANGE_RENEWAL_STATUS records auto-renew off without changing status", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId);
    await t.mutation(internal.billing.appStore.applyNotification, {
      notificationUUID: "n-test",
      notificationType: "DID_CHANGE_RENEWAL_STATUS",
      subtype: "AUTO_RENEW_DISABLED",
      transaction: transaction(),
      renewal: { autoRenews: false },
    });
    const row = await t.run((ctx) => ctx.db.query("appStoreSubscriptions").first());
    expect(row).toMatchObject({ status: "active", autoRenews: false });
  });

  test("an unknown subscription is linked through its account token", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const token = await asUser(t, userId).mutation(api.billing.appStore.getAccountToken, {});
    const result = await t.mutation(internal.billing.appStore.applyNotification, {
      notificationUUID: "n-test",
      notificationType: "SUBSCRIBED",
      subtype: "INITIAL_BUY",
      transaction: transaction({ appAccountToken: token }),
      renewal: { autoRenews: true },
    });
    expect(result).toEqual({ applied: true });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("a subscription with no known owner is not applied", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.billing.appStore.applyNotification, {
      notificationUUID: "n-test",
      notificationType: "DID_RENEW",
      transaction: transaction(),
    });
    expect(result).toEqual({ applied: false });
  });
});

describe("stale and reassigned notifications", () => {
  test("a stale failure notification does not downgrade a newer period", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId, { expiresAt: Date.now() + 30 * DAY });
    const result = await t.mutation(internal.billing.appStore.applyNotification, {
      notificationUUID: "n-test",
      notificationType: "DID_FAIL_TO_RENEW",
      transaction: transaction({ expiresAt: Date.now() - DAY }),
    });
    expect(result).toEqual({ applied: true });
    const row = await t.run((ctx) => ctx.db.query("appStoreSubscriptions").first());
    expect(row?.status).toBe("active");
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("a refund of an older renewal does not revoke the current period", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId, { expiresAt: Date.now() + 60 * DAY });
    await t.mutation(internal.billing.appStore.applyNotification, {
      notificationUUID: "n-test",
      notificationType: "REFUND",
      transaction: transaction({ expiresAt: Date.now() + DAY, revokedAt: Date.now() }),
    });
    const row = await t.run((ctx) => ctx.db.query("appStoreSubscriptions").first());
    expect(row?.status).toBe("active");
  });

  test("REFUND_REVERSED restores a revoked row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const expiresAt = Date.now() + 10 * DAY;
    await seedAppStoreSubscription(t, userId, { status: "revoked", expiresAt });
    await t.mutation(internal.billing.appStore.applyNotification, {
      notificationUUID: "n-test",
      notificationType: "REFUND_REVERSED",
      transaction: transaction({ expiresAt }),
    });
    const row = await t.run((ctx) => ctx.db.query("appStoreSubscriptions").first());
    expect(row?.status).toBe("active");
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("a lapsed row is reassigned to the token owner", async () => {
    const t = convexTest(schema, modules);
    const a = await seedUser(t);
    const b = await seedUser(t);
    await seedAppStoreSubscription(t, a, { status: "expired", expiresAt: Date.now() - 10 * DAY });
    const token = await asUser(t, b).mutation(api.billing.appStore.getAccountToken, {});
    const result = await t.mutation(internal.billing.appStore.applyNotification, {
      notificationUUID: "n-test",
      notificationType: "SUBSCRIBED",
      subtype: "RESUBSCRIBE",
      transaction: transaction({ appAccountToken: token }),
    });
    expect(result).toEqual({ applied: true });
    const row = await t.run((ctx) => ctx.db.query("appStoreSubscriptions").first());
    expect(row?.userId).toBe(b);
  });

  test("an entitled row keeps its owner", async () => {
    const t = convexTest(schema, modules);
    const a = await seedUser(t);
    const b = await seedUser(t);
    await seedAppStoreSubscription(t, a);
    const token = await asUser(t, b).mutation(api.billing.appStore.getAccountToken, {});
    await t.mutation(internal.billing.appStore.applyNotification, {
      notificationUUID: "n-test",
      notificationType: "DID_RENEW",
      transaction: transaction({ appAccountToken: token, expiresAt: Date.now() + 60 * DAY }),
    });
    const row = await t.run((ctx) => ctx.db.query("appStoreSubscriptions").first());
    expect(row?.userId).toBe(a);
  });
});

describe("getPlan", () => {
  test("null when signed out", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.billing.index.getPlan, {})).toBeNull();
  });

  test("free with no subscriptions", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    expect(await asUser(t, userId).query(api.billing.index.getPlan, {})).toMatchObject({
      tier: "free",
      source: null,
      stripe: null,
      appStore: null,
    });
  });

  test("pro from the App Store", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId, { productId: APP_STORE_PRODUCTS.yearly });
    expect(await asUser(t, userId).query(api.billing.index.getPlan, {})).toMatchObject({
      tier: "pro",
      source: "app_store",
      appStore: { productId: APP_STORE_PRODUCTS.yearly, autoRenews: true },
    });
  });

  test("exposes the grace deadline", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const grace = Date.now() + 5 * DAY;
    await seedAppStoreSubscription(t, userId, {
      status: "grace",
      expiresAt: Date.now() - DAY,
      gracePeriodExpiresAt: grace,
    });
    expect(await asUser(t, userId).query(api.billing.index.getPlan, {})).toMatchObject({
      tier: "pro",
      appStore: { status: "grace", gracePeriodExpiresAt: grace },
    });
  });
});

describe("getPlan with both sources", () => {
  test("Stripe wins when the user also has an entitled App Store row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId);
    const now = Date.now();
    await t.run(async (ctx) =>
      ctx.db.insert("stripeSubscriptions", {
        userId,
        stripeSubscriptionId: "sub_both",
        stripeCustomerId: "cus_both",
        stripePriceId: "price_both",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
        interval: "month",
        amount: 1500,
        currency: "usd",
        createdAt: now,
        updatedAt: now,
      })
    );
    expect(await asUser(t, userId).query(api.billing.index.getPlan, {})).toMatchObject({
      tier: "pro",
      source: "stripe",
    });
  });
});

describe("createCheckoutSession", () => {
  test("refuses users who already have Pro from the App Store", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId);
    const error = await asUser(t, userId)
      .action(api.billing.index.createCheckoutSession, {
        interval: "month",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConvexError);
    expect(JSON.stringify((error as ConvexError<unknown>).data)).toMatch(
      /already have Pro through the App Store/
    );
  });
});

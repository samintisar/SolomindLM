/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { isProUser } from "../_lib/limits";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";
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

function transaction(overrides: Partial<Record<string, unknown>> = {}) {
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

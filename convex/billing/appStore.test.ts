/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../_generated/dataModel";
import { isProUser } from "../_lib/limits";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";
import { APP_STORE_PRODUCTS } from "./appStoreProducts";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./billing/index.ts"]);

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

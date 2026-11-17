/// <reference types="vite/client" />

import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { ExternalServiceError } from "../_lib/errors";
import { isProUser } from "../_lib/limits";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";
import { APP_STORE_PRODUCTS } from "./appStoreProducts";

// vi.mock is hoisted above the imports, so the mocks it uses must be hoisted too.
const { verifyTransaction, verifyNotification } = vi.hoisted(() => ({
  verifyTransaction: vi.fn(),
  verifyNotification: vi.fn(),
}));

vi.mock("./appStoreVerifier", () => {
  class AppStoreVerificationError extends Error {}
  return { AppStoreVerificationError, verifyTransaction, verifyNotification };
});

const { AppStoreVerificationError } = await import("./appStoreVerifier");

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(rateLimiterTest.modules, ["./component/lib.ts"]);
preloadModules(modules, ["./billing/appStoreNode.ts", "./billing/appStore.ts"]);

// Fixtures are Sandbox transactions; the gate itself is covered in appStore.test.ts.
beforeEach(() => {
  vi.stubEnv("APP_STORE_SANDBOX_ACCESS", "all");
});

function makeT() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

const DAY = 24 * 60 * 60 * 1000;
type T = ReturnType<typeof convexTest>;

async function seedUser(t: T): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}
function asUser(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}
function tx(overrides: Record<string, unknown> = {}) {
  return {
    environment: "Sandbox",
    originalTransactionId: "1000000000000001",
    transactionId: "2000000000000001",
    productId: APP_STORE_PRODUCTS.monthly,
    expiresAt: Date.now() + 30 * DAY,
    ...overrides,
  };
}

beforeEach(() => {
  verifyTransaction.mockReset();
  verifyNotification.mockReset();
});

describe("syncTransaction", () => {
  test("verifies and stores the caller's purchase", async () => {
    const t = makeT();
    const userId = await seedUser(t);
    const token = await asUser(t, userId).mutation(api.billing.appStore.getAccountToken, {});
    verifyTransaction.mockResolvedValue(tx({ appAccountToken: token }));
    const result = await asUser(t, userId).action(api.billing.appStoreNode.syncTransaction, {
      signedTransaction: "jws",
    });
    expect(result).toEqual({ status: "active" });
    expect(verifyTransaction).toHaveBeenCalledWith("jws");
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("rejects a bad signature", async () => {
    const t = makeT();
    const userId = await seedUser(t);
    verifyTransaction.mockRejectedValue(new AppStoreVerificationError("bad"));
    await expect(
      asUser(t, userId).action(api.billing.appStoreNode.syncTransaction, { signedTransaction: "x" })
    ).rejects.toThrow(/couldn't be verified/);
  });

  test("surfaces a transient verification failure as a structured ConvexError", async () => {
    const t = makeT();
    const userId = await seedUser(t);
    verifyTransaction.mockRejectedValue(
      new ExternalServiceError("app_store", "OCSP unavailable", { retryable: true })
    );
    const error = await asUser(t, userId)
      .action(api.billing.appStoreNode.syncTransaction, { signedTransaction: "x" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConvexError);
  });

  test("rejects products that aren't Pro", async () => {
    const t = makeT();
    const userId = await seedUser(t);
    verifyTransaction.mockResolvedValue(tx({ productId: "com.other.app.thing" }));
    await expect(
      asUser(t, userId).action(api.billing.appStoreNode.syncTransaction, { signedTransaction: "x" })
    ).rejects.toThrow(/Unknown product/);
  });

  test("rejects signed-out callers", async () => {
    const t = makeT();
    await expect(
      t.action(api.billing.appStoreNode.syncTransaction, { signedTransaction: "x" })
    ).rejects.toThrow();
    expect(verifyTransaction).not.toHaveBeenCalled();
  });

  test("rejects oversized payloads before verifying", async () => {
    const t = makeT();
    const userId = await seedUser(t);
    const error = await asUser(t, userId)
      .action(api.billing.appStoreNode.syncTransaction, { signedTransaction: "x".repeat(64_001) })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConvexError);
    expect(verifyTransaction).not.toHaveBeenCalled();
  });
});

describe("handleNotification", () => {
  const eventRow = (t: T, uuid: string) =>
    t.run((ctx) =>
      ctx.db
        .query("appStoreNotificationEvents")
        .withIndex("by_uuid", (q) => q.eq("notificationUUID", uuid))
        .unique()
    );

  test("a non-Pro product is ignored and marked processed", async () => {
    const t = makeT();
    verifyNotification.mockResolvedValue({
      notificationUUID: "n-other",
      notificationType: "DID_RENEW",
      environment: "Sandbox",
      transaction: tx({ productId: "com.other.app.thing" }),
    });
    expect(
      await t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "p" })
    ).toEqual({ result: "ignored" });
    expect((await eventRow(t, "n-other"))?.processed).toBe(true);
  });

  test("an apply failure records the error, and a redelivery succeeds", async () => {
    const t = makeT();
    const userId = await seedUser(t);
    const token = await asUser(t, userId).mutation(api.billing.appStore.getAccountToken, {});
    const notification = (transaction: Record<string, unknown>) => ({
      notificationUUID: "n-fail",
      notificationType: "DID_RENEW",
      environment: "Sandbox",
      transaction,
    });

    // expiresAt of the wrong type fails argument validation inside the apply step.
    verifyNotification.mockResolvedValueOnce(
      notification(tx({ appAccountToken: token, expiresAt: "not-a-number" }))
    );
    await expect(
      t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "p" })
    ).rejects.toThrow();
    const failed = await eventRow(t, "n-fail");
    expect(failed?.processed).toBe(false);
    expect(failed?.errorMessage).toBeTruthy();

    verifyNotification.mockResolvedValueOnce(notification(tx({ appAccountToken: token })));
    expect(
      await t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "p" })
    ).toEqual({ result: "processed" });
    expect((await eventRow(t, "n-fail"))?.processed).toBe(true);
  });

  test("a fresh unprocessed claim is reported as in flight", async () => {
    const t = makeT();
    await t.run((ctx) =>
      ctx.db.insert("appStoreNotificationEvents", {
        notificationUUID: "n-busy",
        notificationType: "DID_RENEW",
        processed: false,
        createdAt: Date.now(),
      })
    );
    verifyNotification.mockResolvedValue({
      notificationUUID: "n-busy",
      notificationType: "DID_RENEW",
      environment: "Sandbox",
      transaction: tx(),
    });
    await expect(
      t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "p" })
    ).rejects.toThrow(/already in flight/);
  });

  test("invalid signatures are reported, not thrown", async () => {
    const t = makeT();
    verifyNotification.mockRejectedValue(new AppStoreVerificationError("bad"));
    expect(
      await t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "x" })
    ).toEqual({ result: "invalid" });
  });

  test("transient verification failures propagate so Apple retries", async () => {
    const t = makeT();
    verifyNotification.mockRejectedValue(
      new ExternalServiceError("app_store", "OCSP unavailable", { retryable: true })
    );
    await expect(
      t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "x" })
    ).rejects.toThrow(/OCSP unavailable/);
  });

  test("applies a renewal once and skips the duplicate", async () => {
    const t = makeT();
    const userId = await seedUser(t);
    const token = await asUser(t, userId).mutation(api.billing.appStore.getAccountToken, {});
    verifyNotification.mockResolvedValue({
      notificationUUID: "n-1",
      notificationType: "SUBSCRIBED",
      subtype: "INITIAL_BUY",
      environment: "Sandbox",
      transaction: tx({ appAccountToken: token }),
      renewal: { autoRenews: true },
    });
    expect(
      await t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "p" })
    ).toEqual({ result: "processed" });
    expect(
      await t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "p" })
    ).toEqual({ result: "duplicate" });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("notifications without a transaction are ignored", async () => {
    const t = makeT();
    verifyNotification.mockResolvedValue({
      notificationUUID: "n-test",
      notificationType: "TEST",
      environment: "Sandbox",
    });
    expect(
      await t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "p" })
    ).toEqual({ result: "ignored" });
  });

  test("an unknown owner is reported as unlinked", async () => {
    const t = makeT();
    verifyNotification.mockResolvedValue({
      notificationUUID: "n-2",
      notificationType: "DID_RENEW",
      environment: "Sandbox",
      transaction: tx(),
    });
    expect(
      await t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "p" })
    ).toEqual({ result: "unlinked" });
  });
});

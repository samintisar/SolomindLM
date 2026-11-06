/// <reference types="vite/client" />
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
preloadModules(modules, ["./billing/appStoreNode.ts", "./billing/appStore.ts"]);

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
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    verifyTransaction.mockRejectedValue(new AppStoreVerificationError("bad"));
    await expect(
      asUser(t, userId).action(api.billing.appStoreNode.syncTransaction, { signedTransaction: "x" })
    ).rejects.toThrow(/couldn't be verified/);
  });

  test("surfaces a transient verification failure as a structured ConvexError", async () => {
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    verifyTransaction.mockResolvedValue(tx({ productId: "com.other.app.thing" }));
    await expect(
      asUser(t, userId).action(api.billing.appStoreNode.syncTransaction, { signedTransaction: "x" })
    ).rejects.toThrow(/Unknown product/);
  });

  test("rejects signed-out callers", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.billing.appStoreNode.syncTransaction, { signedTransaction: "x" })
    ).rejects.toThrow();
  });
});

describe("handleNotification", () => {
  test("invalid signatures are reported, not thrown", async () => {
    const t = convexTest(schema, modules);
    verifyNotification.mockRejectedValue(new AppStoreVerificationError("bad"));
    expect(
      await t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "x" })
    ).toEqual({ result: "invalid" });
  });

  test("transient verification failures propagate so Apple retries", async () => {
    const t = convexTest(schema, modules);
    verifyNotification.mockRejectedValue(
      new ExternalServiceError("app_store", "OCSP unavailable", { retryable: true })
    );
    await expect(
      t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "x" })
    ).rejects.toThrow(/OCSP unavailable/);
  });

  test("applies a renewal once and skips the duplicate", async () => {
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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

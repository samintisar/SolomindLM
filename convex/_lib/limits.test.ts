/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import {
  checkDailyLimit,
  checkNotebookLimit,
  checkSourceLimit,
  consumeDailyLimit,
  getSubscriptionLimit,
} from "./limits";
import * as rateLimitsModule from "./rateLimits";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

async function seedUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}

async function seedNotebook(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  count = 1
): Promise<Id<"notebooks">[]> {
  const ids: Id<"notebooks">[] = [];
  for (let i = 0; i < count; i++) {
    const id = await t.run(async (ctx) =>
      ctx.db.insert("notebooks", {
        userId,
        title: `Notebook ${i + 1}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    ids.push(id);
  }
  return ids;
}

async function seedDocument(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  notebookId: Id<"notebooks">
): Promise<Id<"documents">> {
  return t.run(async (ctx) =>
    ctx.db.insert("documents", {
      userId,
      notebookId,
      fileName: "Test Doc",
      fileType: "text",
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function seedSubscription(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">
): Promise<Id<"stripeSubscriptions">> {
  return t.run(async (ctx) =>
    ctx.db.insert("stripeSubscriptions", {
      userId,
      stripeSubscriptionId: "sub_test",
      stripePriceId: "price_test",
      stripeCustomerId: "cus_test",
      cancelAtPeriodEnd: false,
      interval: "month",
      amount: 999,
      currency: "usd",
      status: "active",
      currentPeriodStart: Date.now(),
      currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

describe("checkNotebookLimit", () => {
  test("does not throw when under free limit", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedNotebook(t, userId, 3);
    const asUser = withAuth(t, userId);

    await expect(asUser.run(async (ctx) => checkNotebookLimit(ctx))).resolves.toBeNull();
  });

  test("throws when at free limit (5 notebooks)", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedNotebook(t, userId, 5);
    const asUser = withAuth(t, userId);

    await expect(asUser.run(async (ctx) => checkNotebookLimit(ctx))).rejects.toThrow(
      "Notebook limit reached"
    );
  });

  test("throws when over free limit", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedNotebook(t, userId, 6);
    const asUser = withAuth(t, userId);

    await expect(asUser.run(async (ctx) => checkNotebookLimit(ctx))).rejects.toThrow(
      "Notebook limit reached"
    );
  });

  test("allows up to 200 notebooks for pro users", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedSubscription(t, userId);
    await seedNotebook(t, userId, 199);
    const asUser = withAuth(t, userId);

    await expect(asUser.run(async (ctx) => checkNotebookLimit(ctx))).resolves.toBeNull();
  });

  test("throws when pro user reaches 200 notebooks", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedSubscription(t, userId);
    await seedNotebook(t, userId, 200);
    const asUser = withAuth(t, userId);

    await expect(asUser.run(async (ctx) => checkNotebookLimit(ctx))).rejects.toThrow(
      "Notebook limit reached"
    );
  });

  test("throws unauthenticated when no user", async () => {
    const t = convexTest(schema, modules);
    await expect(t.run(async (ctx) => checkNotebookLimit(ctx))).rejects.toThrow("Unauthenticated");
  });
});

describe("checkSourceLimit", () => {
  test("does not throw when under source limit", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const [notebookId] = await seedNotebook(t, userId);
    await seedDocument(t, userId, notebookId);
    const asUser = withAuth(t, userId);

    await expect(asUser.run(async (ctx) => checkSourceLimit(ctx, notebookId))).resolves.toBeNull();
  });

  test("throws when at free source limit (20 documents)", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const [notebookId] = await seedNotebook(t, userId);

    // Seed 20 documents (the free-tier cap)
    for (let i = 0; i < 20; i++) {
      await seedDocument(t, userId, notebookId);
    }

    const asUser = withAuth(t, userId);
    await expect(asUser.run(async (ctx) => checkSourceLimit(ctx, notebookId))).rejects.toThrow(
      "Source limit reached"
    );
  });

  test("allows up to 200 sources per notebook for pro users", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedSubscription(t, userId);
    const [notebookId] = await seedNotebook(t, userId);

    // Seed 21 documents — over the free cap but under the pro cap
    for (let i = 0; i < 21; i++) {
      await seedDocument(t, userId, notebookId);
    }

    const asUser = withAuth(t, userId);
    await expect(asUser.run(async (ctx) => checkSourceLimit(ctx, notebookId))).resolves.toBeNull();
  });

  test("throws unauthenticated when no user", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const [notebookId] = await seedNotebook(t, userId);

    await expect(t.run(async (ctx) => checkSourceLimit(ctx, notebookId))).rejects.toThrow(
      "Unauthenticated"
    );
  });
});

describe("getSubscriptionLimit", () => {
  test("returns pro limits when isPro=true", () => {
    expect(getSubscriptionLimit("chat", true)).toBe(500);
    expect(getSubscriptionLimit("flashcard", true)).toBe(100);
    expect(getSubscriptionLimit("audio", true)).toBe(100);
  });

  test("returns free limits when isPro=false", () => {
    expect(getSubscriptionLimit("chat", false)).toBe(10);
    expect(getSubscriptionLimit("flashcard", false)).toBe(2);
    expect(getSubscriptionLimit("audio", false)).toBe(2);
  });
});

describe("checkDailyLimit", () => {
  test("does not throw when under daily limit", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    // Mock rateLimiter.check to not throw
    const originalCheck = rateLimitsModule.rateLimiter.check;
    rateLimitsModule.rateLimiter.check = vi.fn().mockResolvedValue(undefined);

    await expect(
      asUser.run(async (ctx) => checkDailyLimit(ctx, userId, "chat"))
    ).resolves.toBeNull();

    rateLimitsModule.rateLimiter.check = originalCheck;
  });

  test("throws when daily limit is reached", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    // Mock rateLimiter.check to throw
    const originalCheck = rateLimitsModule.rateLimiter.check;
    rateLimitsModule.rateLimiter.check = vi.fn().mockRejectedValue(new Error("Rate limit"));

    await expect(asUser.run(async (ctx) => checkDailyLimit(ctx, userId, "chat"))).rejects.toThrow(
      "Daily chat message limit reached"
    );

    rateLimitsModule.rateLimiter.check = originalCheck;
  });

  test("uses pro limits when user has active subscription", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedSubscription(t, userId);
    const asUser = withAuth(t, userId);

    const originalCheck = rateLimitsModule.rateLimiter.check;
    const checkMock = vi.fn().mockResolvedValue(undefined);
    rateLimitsModule.rateLimiter.check = checkMock;

    await asUser.run(async (ctx) => checkDailyLimit(ctx, userId, "chat"));

    // Verify it was called with the pro limit key
    expect(checkMock).toHaveBeenCalledWith(
      expect.anything(),
      "chatPro",
      expect.objectContaining({ key: userId, throws: true })
    );

    rateLimitsModule.rateLimiter.check = originalCheck;
  });

  test("uses free limits when user has no subscription", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const originalCheck = rateLimitsModule.rateLimiter.check;
    const checkMock = vi.fn().mockResolvedValue(undefined);
    rateLimitsModule.rateLimiter.check = checkMock;

    await asUser.run(async (ctx) => checkDailyLimit(ctx, userId, "chat"));

    expect(checkMock).toHaveBeenCalledWith(
      expect.anything(),
      "chatFree",
      expect.objectContaining({ key: userId, throws: true })
    );

    rateLimitsModule.rateLimiter.check = originalCheck;
  });
});

describe("consumeDailyLimit", () => {
  test("consumes limit without throwing on success", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const originalLimit = rateLimitsModule.rateLimiter.limit;
    rateLimitsModule.rateLimiter.limit = vi.fn().mockResolvedValue(undefined);

    await expect(
      asUser.run(async (ctx) => consumeDailyLimit(ctx, userId, "chat"))
    ).resolves.toBeNull();

    rateLimitsModule.rateLimiter.limit = originalLimit;
  });

  test("does not throw when consumption fails", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const originalLimit = rateLimitsModule.rateLimiter.limit;
    rateLimitsModule.rateLimiter.limit = vi.fn().mockRejectedValue(new Error("Already at limit"));

    await expect(
      asUser.run(async (ctx) => consumeDailyLimit(ctx, userId, "chat"))
    ).resolves.toBeNull();

    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
    rateLimitsModule.rateLimiter.limit = originalLimit;
  });
});

describe("internal mutation wrappers", () => {
  test("checkDailyLimitInternal proxies to checkDailyLimit", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const originalCheck = rateLimitsModule.rateLimiter.check;
    rateLimitsModule.rateLimiter.check = vi.fn().mockResolvedValue(undefined);

    await expect(
      asUser.mutation(api._lib.limits.checkDailyLimitInternal, {
        userId: userId as string,
        feature: "chat",
      })
    ).resolves.toBeNull();

    rateLimitsModule.rateLimiter.check = originalCheck;
  });

  test("consumeDailyLimitInternal proxies to consumeDailyLimit", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const originalLimit = rateLimitsModule.rateLimiter.limit;
    rateLimitsModule.rateLimiter.limit = vi.fn().mockResolvedValue(undefined);

    await expect(
      asUser.mutation(api._lib.limits.consumeDailyLimitInternal, {
        userId: userId as string,
        feature: "chat",
      })
    ).resolves.toBeNull();

    rateLimitsModule.rateLimiter.limit = originalLimit;
  });
});

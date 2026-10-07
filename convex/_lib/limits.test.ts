/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";
import { FREE_FEATURE_LIMITS, PRO_FEATURE_LIMITS } from "./errors";
import {
  assertConcurrentRunCapacity,
  assertRetryAllowed,
  checkDailyLimit,
  checkNotebookLimit,
  checkSourceLimit,
  consumeDailyLimit,
  getSubscriptionLimit,
  STALE_RUN_MS,
  takeFeatureRun,
} from "./limits";
import * as rateLimitsModule from "./rateLimits";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(rateLimiterTest.modules, ["./component/lib.ts"]);

/** convexTest with the real rate-limiter component, for tests that exercise the windows. */
function setupWithRateLimiter() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

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
    expect(getSubscriptionLimit("audio", true)).toBe(20);
  });

  test("returns free limits when isPro=false", () => {
    expect(getSubscriptionLimit("chat", false)).toBe(10);
    expect(getSubscriptionLimit("flashcard", false)).toBe(1);
    expect(getSubscriptionLimit("audio", false)).toBe(3);
  });
});

describe("daily limit tables — single source of truth", () => {
  const FEATURES = [
    "chat",
    "flashcard",
    "quiz",
    "report",
    "audio",
    "writtenQuestion",
    "spreadsheet",
    "infographic",
    "sourceGuide",
    "mindmap",
    "literatureReview",
    "deepResearch",
  ] as const;

  test("errors.ts and rateLimits.ts expose the same accessor functions", async () => {
    const errorsModule = await import("./errors");
    expect(rateLimitsModule.getFreeLimit).toBe(errorsModule.getFreeLimit);
    expect(rateLimitsModule.getProLimit).toBe(errorsModule.getProLimit);
  });

  test("every rate-limiter window is derived from the same limit and window", () => {
    for (const feature of FEATURES) {
      const free = FREE_FEATURE_LIMITS[feature];
      const freeWindow = rateLimitsModule.RATE_LIMIT_CONFIG[`${feature}Free`];
      if (free) {
        expect(freeWindow.rate).toBe(rateLimitsModule.getFreeLimit(feature));
        expect(freeWindow.period).toBe(rateLimitsModule.WINDOW_PERIOD_MS[free.window]);
      } else {
        expect(freeWindow).toBeUndefined();
      }
      const proWindow = rateLimitsModule.RATE_LIMIT_CONFIG[`${feature}Pro`];
      expect(proWindow.rate).toBe(rateLimitsModule.getProLimit(feature));
      expect(proWindow.period).toBe(
        rateLimitsModule.WINDOW_PERIOD_MS[PRO_FEATURE_LIMITS[feature].window]
      );
    }
  });

  test("Free audio is weekly and the Free literature review is once per 30 days", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(rateLimitsModule.RATE_LIMIT_CONFIG.audioFree).toEqual({
      kind: "token bucket",
      rate: 3,
      period: 7 * day,
      capacity: 3,
    });
    expect(rateLimitsModule.RATE_LIMIT_CONFIG.literatureReviewFree).toEqual({
      kind: "token bucket",
      rate: 1,
      period: 30 * day,
      capacity: 1,
    });
    expect(rateLimitsModule.RATE_LIMIT_CONFIG.chatFree.kind).toBe("fixed window");
  });

  test("a used 30-day run only comes back once the full 30 days have passed", async () => {
    vi.useFakeTimers();
    try {
      const t = setupWithRateLimiter();
      const userId = await seedUser(t);
      const day = 24 * 60 * 60 * 1000;

      await t.run((ctx) => takeFeatureRun(ctx, userId, "literatureReview"));
      vi.advanceTimersByTime(29 * day);
      await expect(t.run((ctx) => takeFeatureRun(ctx, userId, "literatureReview"))).rejects.toThrow(
        "30-day literature review limit"
      );
      vi.advanceTimersByTime(day + 1000);
      await expect(
        t.run((ctx) => takeFeatureRun(ctx, userId, "literatureReview"))
      ).resolves.toEqual({ isPro: false });
    } finally {
      vi.useRealTimers();
    }
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

describe("Pro-only features", () => {
  test("checkDailyLimit rejects a Free user without consulting the rate limiter", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const checkSpy = vi.spyOn(rateLimitsModule.rateLimiter, "check");

    await expect(t.run((ctx) => checkDailyLimit(ctx, userId, "infographic"))).rejects.toThrow(
      "Infographic is a Pro feature"
    );
    expect(checkSpy).not.toHaveBeenCalled();
    checkSpy.mockRestore();
  });

  test("checkDailyLimit lets a Pro user through", async () => {
    const t = setupWithRateLimiter();
    const userId = await seedUser(t);
    await seedSubscription(t, userId);

    await expect(t.run((ctx) => checkDailyLimit(ctx, userId, "infographic"))).resolves.toBeNull();
  });

  test("consumeDailyLimit is a no-op for a Free user on a Pro-only feature", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const limitSpy = vi.spyOn(rateLimitsModule.rateLimiter, "limit");

    await t.run((ctx) => consumeDailyLimit(ctx, userId, "infographic"));
    expect(limitSpy).not.toHaveBeenCalled();
    limitSpy.mockRestore();
  });
});

describe("takeFeatureRun", () => {
  test("a Free user gets one literature review, then the 30-day limit", async () => {
    const t = setupWithRateLimiter();
    const userId = await seedUser(t);

    await expect(t.run((ctx) => takeFeatureRun(ctx, userId, "literatureReview"))).resolves.toEqual({
      isPro: false,
    });
    await expect(t.run((ctx) => takeFeatureRun(ctx, userId, "literatureReview"))).rejects.toThrow(
      "30-day literature review limit reached (1/1)"
    );
  });

  test("a Pro user can take several runs a day", async () => {
    const t = setupWithRateLimiter();
    const userId = await seedUser(t);
    await seedSubscription(t, userId);

    for (let i = 0; i < 3; i++) {
      await expect(t.run((ctx) => takeFeatureRun(ctx, userId, "deepResearch"))).resolves.toEqual({
        isPro: true,
      });
    }
  });

  test("deep research is Pro only", async () => {
    const t = setupWithRateLimiter();
    const userId = await seedUser(t);

    await expect(t.run((ctx) => takeFeatureRun(ctx, userId, "deepResearch"))).rejects.toThrow(
      "Deep research is a Pro feature"
    );
  });
});

type ReviewStatus =
  | "planning"
  | "awaiting_columns"
  | "searching"
  | "processing"
  | "completed"
  | "failed";

async function seedReviewSession(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  status: ReviewStatus,
  updatedAt = Date.now()
) {
  await t.run(async (ctx) => {
    const notebookId = await ctx.db.insert("notebooks", {
      userId,
      title: "Notebook",
      createdAt: updatedAt,
      updatedAt,
    });
    await ctx.db.insert("literatureReviewSessions", {
      query: "q",
      notebookId,
      userId,
      workflowId: "wf",
      status,
      createdAt: updatedAt,
      updatedAt,
    });
  });
}

describe("assertConcurrentRunCapacity", () => {
  test("rejects a Pro user's fourth literature review while three are running", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedReviewSession(t, userId, "planning");
    await seedReviewSession(t, userId, "searching");
    await seedReviewSession(t, userId, "processing");

    await expect(
      t.run((ctx) => assertConcurrentRunCapacity(ctx, userId, "literatureReview", true))
    ).rejects.toThrow("You already have 3 literature review runs in progress (limit 3)");
  });

  test("ignores finished runs, runs waiting on the user, and stale runs", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedReviewSession(t, userId, "completed");
    await seedReviewSession(t, userId, "failed");
    await seedReviewSession(t, userId, "awaiting_columns");
    await seedReviewSession(t, userId, "processing", Date.now() - STALE_RUN_MS - 1000);

    await expect(
      t.run((ctx) => assertConcurrentRunCapacity(ctx, userId, "literatureReview", false))
    ).resolves.toBeNull();
  });

  test("old stuck runs don't hide the user's live ones", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    for (let i = 0; i < 4; i++) {
      await seedReviewSession(t, userId, "processing", Date.now() - STALE_RUN_MS - 1000);
    }
    for (let i = 0; i < 3; i++) {
      await seedReviewSession(t, userId, "processing");
    }

    await expect(
      t.run((ctx) => assertConcurrentRunCapacity(ctx, userId, "literatureReview", true))
    ).rejects.toThrow("3 literature review runs in progress");
  });

  test("a Free user can have one run in progress", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedReviewSession(t, userId, "searching");

    await expect(
      t.run((ctx) => assertConcurrentRunCapacity(ctx, userId, "literatureReview", false))
    ).rejects.toThrow("(limit 1)");
  });
});

describe("assertRetryAllowed", () => {
  test("allows up to three retries per run", () => {
    expect(() => assertRetryAllowed(undefined, "literatureReview", false)).not.toThrow();
    expect(() => assertRetryAllowed(2, "literatureReview", false)).not.toThrow();
    expect(() => assertRetryAllowed(3, "literatureReview", false)).toThrow(
      "already been retried 3 times"
    );
  });
});

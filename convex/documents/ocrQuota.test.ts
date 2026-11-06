/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { OCR_PAGE_LIMITS, ocrMonthKey } from "../_lib/ocrPageLimits";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./documents/ocrQuota.ts"]);

async function seedUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}

async function seedPro(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  const now = Date.now();
  await t.run(async (ctx) =>
    ctx.db.insert("stripeSubscriptions", {
      userId,
      stripeSubscriptionId: "sub_seed",
      stripeCustomerId: "cus_seed",
      stripePriceId: "price_seed",
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
      cancelAtPeriodEnd: false,
      interval: "month",
      amount: 750,
      currency: "usd",
      createdAt: now,
      updatedAt: now,
    })
  );
}

async function usedPages(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.run(async (ctx) => {
    const row = await ctx.db
      .query("ocrUsage")
      .withIndex("by_user_and_month", (q) =>
        q.eq("userId", userId).eq("month", ocrMonthKey(Date.now()))
      )
      .unique();
    return row?.pages ?? 0;
  });
}

describe("reserveOcrPages", () => {
  test("grants a Free user the per-file cap and records it", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const r = await t.mutation(internal.documents.ocrQuota.reserveOcrPages, { userId });

    expect(r).toMatchObject({ granted: OCR_PAGE_LIMITS.free.perFile, isPro: false });
    expect(await usedPages(t, userId)).toBe(OCR_PAGE_LIMITS.free.perFile);
  });

  test("grants a Pro user the Pro cap", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedPro(t, userId);

    const r = await t.mutation(internal.documents.ocrQuota.reserveOcrPages, { userId });

    expect(r).toMatchObject({ granted: OCR_PAGE_LIMITS.pro.perFile, isPro: true });
  });

  test("grants the rest of the month, then nothing", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const { perFile, perMonth } = OCR_PAGE_LIMITS.free;

    let total = 0;
    for (let i = 0; i < Math.ceil(perMonth / perFile); i++) {
      total += (await t.mutation(internal.documents.ocrQuota.reserveOcrPages, { userId })).granted;
    }
    const last = await t.mutation(internal.documents.ocrQuota.reserveOcrPages, { userId });

    expect(total).toBe(perMonth);
    expect(last.granted).toBe(0);
  });
});

describe("releaseOcrPages", () => {
  test("hands back the pages a call did not read", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const r = await t.mutation(internal.documents.ocrQuota.reserveOcrPages, { userId });

    await t.mutation(internal.documents.ocrQuota.releaseOcrPages, {
      userId,
      month: r.month,
      pages: r.granted - 4,
    });

    expect(await usedPages(t, userId)).toBe(4);
  });

  test("never drops usage below zero", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const r = await t.mutation(internal.documents.ocrQuota.reserveOcrPages, { userId });

    await t.mutation(internal.documents.ocrQuota.releaseOcrPages, {
      userId,
      month: r.month,
      pages: r.granted + 50,
    });

    expect(await usedPages(t, userId)).toBe(0);
  });
});

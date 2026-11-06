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

describe("grantOcrBonus", () => {
  const month = () => ocrMonthKey(Date.now());

  async function seedEmailUser(t: ReturnType<typeof convexTest>, email: string) {
    return t.run(async (ctx) => ctx.db.insert("users", { name: "Test", email }));
  }

  test("adds bonus pages to the month's allowance, by email", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedEmailUser(t, "a@example.com");
    const { perFile, perMonth } = OCR_PAGE_LIMITS.free;

    const result = await t.mutation(internal.documents.ocrQuota.grantOcrBonus, {
      emails: ["a@example.com", "nobody@example.com"],
      month: month(),
      pages: 60,
    });
    let total = 0;
    for (let i = 0; i < Math.ceil((perMonth + 60) / perFile) + 1; i++) {
      total += (await t.mutation(internal.documents.ocrQuota.reserveOcrPages, { userId })).granted;
    }

    expect(result).toEqual({ granted: 1, missing: ["nobody@example.com"] });
    expect(total).toBe(perMonth + 60);
  });

  test("is safe to run twice: the bonus is set, not added again", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedEmailUser(t, "a@example.com");
    const args = { emails: ["a@example.com"], month: month(), pages: 60 };

    await t.mutation(internal.documents.ocrQuota.grantOcrBonus, args);
    await t.mutation(internal.documents.ocrQuota.grantOcrBonus, args);

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("ocrUsage")
        .withIndex("by_user_and_month", (q) => q.eq("userId", userId).eq("month", month()))
        .unique()
    );
    expect(row?.bonusPages).toBe(60);
  });

  test("handing back pages keeps the bonus", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedEmailUser(t, "a@example.com");
    await t.mutation(internal.documents.ocrQuota.grantOcrBonus, {
      emails: ["a@example.com"],
      month: month(),
      pages: 60,
    });
    const r = await t.mutation(internal.documents.ocrQuota.reserveOcrPages, { userId });
    await t.mutation(internal.documents.ocrQuota.releaseOcrPages, {
      userId,
      month: r.month,
      pages: r.granted,
    });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("ocrUsage")
        .withIndex("by_user_and_month", (q) => q.eq("userId", userId).eq("month", month()))
        .unique()
    );
    expect(row).toMatchObject({ pages: 0, bonusPages: 60 });
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

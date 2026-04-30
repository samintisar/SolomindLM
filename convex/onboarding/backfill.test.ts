/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

// convex-test resolves function references via module keys relative to the
// convex/ root. Use a root-absolute glob so keys are stable from any subdir.
const rawModules = import.meta.glob("/convex/**/*.ts") as Record<
  string,
  () => Promise<unknown>
>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [
    key.replace(/^\/convex\//, "./"),
    loader,
  ]),
);

describe("backfillLegacyOnboarding", () => {
  test("inserts completed row for every user without one; idempotent on re-run", async () => {
    const t = convexTest(schema, modules);
    const u1 = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "A" }),
    );
    const u2 = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "B" }),
    );
    const u3 = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "C" }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("userOnboarding", {
        userId: u3,
        tourStatus: "active",
        currentStepId: "addSource",
        checklistDismissed: false,
      }),
    );

    const result1 = await t.mutation(
      api.onboarding.backfill.backfillLegacyOnboarding,
      {},
    );
    expect(result1.created).toBe(2);
    expect(result1.skipped).toBe(1);

    const result2 = await t.mutation(
      api.onboarding.backfill.backfillLegacyOnboarding,
      {},
    );
    expect(result2.created).toBe(0);
    expect(result2.skipped).toBe(3);

    for (const userId of [u1, u2]) {
      const row = await t.run(async (ctx) =>
        ctx.db
          .query("userOnboarding")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .unique(),
      );
      expect(row).toMatchObject({
        tourStatus: "completed",
        checklistDismissed: true,
      });
    }
  });
});

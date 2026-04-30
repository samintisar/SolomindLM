/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import { FRESH_USER_WINDOW_MS } from "./constants";

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

function withAuth(t: ReturnType<typeof convexTest>, userId: string) {
  return t.withIdentity({ subject: `${userId}|session1` });
}

/**
 * Insert a user whose `_creationTime` is older than `FRESH_USER_WINDOW_MS`.
 * convex-test stamps `_creationTime` from `Date.now()` at insert time, so we
 * temporarily rewind the system clock, insert, then restore.
 */
async function insertLegacyUser(
  t: ReturnType<typeof convexTest>,
  name: string,
) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.now() - FRESH_USER_WINDOW_MS - 60_000));
  try {
    return await t.run(async (ctx) => ctx.db.insert("users", { name }));
  } finally {
    vi.useRealTimers();
  }
}

describe("getOnboardingState", () => {
  test("returns null when not authenticated", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.onboarding.state.getOnboardingState, {});
    expect(result).toBeNull();
  });

  test("returns row for authenticated user with row", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Alice" }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("userOnboarding", {
        userId,
        tourStatus: "active",
        currentStepId: "addSource",
        checklistDismissed: false,
      }),
    );
    const result = await withAuth(t, userId).query(
      api.onboarding.state.getOnboardingState,
      {},
    );
    expect(result).toMatchObject({ tourStatus: "active", currentStepId: "addSource" });
  });

  test("contextual default: fresh user (recent _creationTime) → pending", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Fresh" }),
    );
    const result = await withAuth(t, userId).query(
      api.onboarding.state.getOnboardingState,
      {},
    );
    expect(result).toMatchObject({
      tourStatus: "pending",
      checklistDismissed: false,
    });
  });

  test("contextual default: legacy user (old _creationTime) → completed", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertLegacyUser(t, "Legacy");
    const result = await withAuth(t, userId).query(
      api.onboarding.state.getOnboardingState,
      {},
    );
    expect(result).toMatchObject({
      tourStatus: "completed",
      checklistDismissed: true,
    });
  });
});

describe("getOrCreateOnboardingRow", () => {
  test("creates pending row for fresh user", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Fresh" }),
    );
    const auth = withAuth(t, userId);
    await auth.mutation(api.onboarding.state.getOrCreateOnboardingRow, {});
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("userOnboarding")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    );
    expect(row).toMatchObject({
      tourStatus: "pending",
      checklistDismissed: false,
    });
  });

  test("creates completed row for legacy user", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertLegacyUser(t, "Legacy");
    await withAuth(t, userId).mutation(
      api.onboarding.state.getOrCreateOnboardingRow,
      {},
    );
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
  });

  test("idempotent — does not duplicate row", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "X" }),
    );
    const auth = withAuth(t, userId);
    await auth.mutation(api.onboarding.state.getOrCreateOnboardingRow, {});
    await auth.mutation(api.onboarding.state.getOrCreateOnboardingRow, {});
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("userOnboarding")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
    expect(rows).toHaveLength(1);
  });

  test("throws when not authenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.onboarding.state.getOrCreateOnboardingRow, {}),
    ).rejects.toThrow();
  });
});

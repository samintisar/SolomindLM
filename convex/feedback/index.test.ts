/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// The committed `convex/_lib/env.ts` snapshots `process.env` at module-eval
// time, and convex-test loads that module once per test file (on the first
// function call), before the per-test `vi.stubEnv` calls below run. Stub at
// module scope so the allowlist is in place when `env.ts` first evaluates.
vi.stubEnv("FEEDBACK_ADMIN_EMAILS", "boss@solomind.com");

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

function makeT() {
  const t = convexTest(schema, modules);
  // convex-test 0.0.50 does not auto-register components; the `submit`
  // mutation calls into the rate-limiter component.
  registerRateLimiter(t);
  return t;
}

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}
async function seedUser(t: ReturnType<typeof convexTest>, email?: string): Promise<Id<"users">> {
  return t.run(async (ctx) =>
    ctx.db.insert("users", { name: "Test", ...(email ? { email } : {}) })
  );
}

const draft = {
  type: "bug" as const,
  body: "Quiz won't submit",
  detail: "click finish on a blank quiz",
  route: "/notebook/abc/quiz",
  surface: "web" as const,
  appVersion: "2.4.1",
};

describe("feedback.index", () => {
  test("submit stores a row with server-derived free tier and received status", async () => {
    const t = makeT();
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const res = await asUser.mutation(api.feedback.index.submit, draft);
    expect(res.id).toBeDefined();

    const mine = await asUser.query(api.feedback.index.listMine, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ type: "bug", status: "received", body: "Quiz won't submit" });

    const row = await t.run((ctx) => ctx.db.get(res.id as Id<"feedback">));
    expect(row?.planTier).toBe("free");
    expect(row?.userId).toBe(userId);
  });

  test("submit derives pro tier from an active subscription", async () => {
    const t = makeT();
    const userId = await seedUser(t);
    await t.run((ctx) =>
      ctx.db.insert("stripeSubscriptions", {
        userId,
        stripeSubscriptionId: "sub_1",
        stripeCustomerId: "cus_1",
        stripePriceId: "price_1",
        status: "active",
        currentPeriodStart: 0,
        currentPeriodEnd: 0,
        cancelAtPeriodEnd: false,
        interval: "month",
        amount: 0,
        currency: "usd",
        createdAt: 0,
        updatedAt: 0,
      })
    );
    const res = await withAuth(t, userId).mutation(api.feedback.index.submit, draft);
    const row = await t.run((ctx) => ctx.db.get(res.id as Id<"feedback">));
    expect(row?.planTier).toBe("pro");
  });

  test("submit rejects an empty body", async () => {
    const t = makeT();
    const userId = await seedUser(t);
    await expect(
      withAuth(t, userId).mutation(api.feedback.index.submit, { ...draft, body: "   " })
    ).rejects.toThrow(/description/i);
  });

  test("submit rejects an unauthenticated caller", async () => {
    const t = makeT();
    await expect(t.mutation(api.feedback.index.submit, draft)).rejects.toThrow(/unauth/i);
  });

  test("submit is rate-limited after 5 in an hour", async () => {
    const t = makeT();
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    for (let i = 0; i < 5; i++) {
      await asUser.mutation(api.feedback.index.submit, { ...draft, body: `x${i}` });
    }
    await expect(
      asUser.mutation(api.feedback.index.submit, { ...draft, body: "x6" })
    ).rejects.toThrow();
  });

  test("listMine only returns the caller's rows", async () => {
    const t = makeT();
    const a = await seedUser(t);
    const b = await seedUser(t);
    await withAuth(t, a).mutation(api.feedback.index.submit, draft);
    expect(await withAuth(t, b).query(api.feedback.index.listMine, {})).toHaveLength(0);
  });

  test("isAdmin reflects the allowlist", async () => {
    vi.stubEnv("FEEDBACK_ADMIN_EMAILS", "boss@solomind.com");
    const t = makeT();
    const admin = await seedUser(t, "boss@solomind.com");
    const plain = await seedUser(t, "nope@x.com");
    expect(await withAuth(t, admin).query(api.feedback.index.isAdmin, {})).toBe(true);
    expect(await withAuth(t, plain).query(api.feedback.index.isAdmin, {})).toBe(false);
    vi.unstubAllEnvs();
  });

  test("listAll rejects a non-admin and returns rows for an admin", async () => {
    vi.stubEnv("FEEDBACK_ADMIN_EMAILS", "boss@solomind.com");
    const t = makeT();
    const admin = await seedUser(t, "boss@solomind.com");
    const user = await seedUser(t, "user@x.com");
    await withAuth(t, user).mutation(api.feedback.index.submit, draft);

    await expect(withAuth(t, user).query(api.feedback.index.listAll, {})).rejects.toThrow(
      /authoriz/i
    );
    const all = await withAuth(t, admin).query(api.feedback.index.listAll, {});
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ route: "/notebook/abc/quiz", planTier: "free" });
    vi.unstubAllEnvs();
  });
});

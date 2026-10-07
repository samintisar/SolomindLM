/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { takeFeatureRun } from "../../_lib/limits";
import { preloadModules } from "../../_testing/preloadModules.helpers";
import schema from "../../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./studio/literature_tables/index.ts"]);
preloadModules(rateLimiterTest.modules, ["./component/lib.ts"]);

async function setup() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  const { userId, notebookId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Test User" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId,
      title: "Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { userId, notebookId };
  });
  const asUser = t.withIdentity({ subject: `${userId}|session1` });
  return { t, userId, notebookId, asUser };
}

async function seedFailedSession(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  notebookId: Id<"notebooks">,
  retryCount: number
) {
  return t.run((ctx) =>
    ctx.db.insert("literatureReviewSessions", {
      query: "q",
      notebookId,
      userId,
      workflowId: "wf_1",
      status: "failed",
      retryCount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

describe("literature review limits", () => {
  test("a Free user's second review in 30 days is refused before any work starts", async () => {
    const { t, userId, notebookId, asUser } = await setup();
    await t.run((ctx) => takeFeatureRun(ctx, userId, "literatureReview"));

    await expect(
      asUser.mutation(api.studio.literature_tables.index.startLiteratureReview, {
        query: "retrieval-augmented generation",
        notebookId,
      })
    ).rejects.toThrow("30-day literature review limit reached (1/1)");

    const sessions = await t.run((ctx) => ctx.db.query("literatureReviewSessions").collect());
    expect(sessions).toHaveLength(0);
  });

  test("a run that has been retried three times can't be retried again", async () => {
    const { t, userId, notebookId, asUser } = await setup();
    const sessionId = await seedFailedSession(t, userId, notebookId, 3);

    await expect(
      asUser.mutation(api.studio.literature_tables.index.retryLiteratureReview, { sessionId })
    ).rejects.toThrow("already been retried 3 times");

    const session = await t.run((ctx) => ctx.db.get(sessionId));
    expect(session?.retryCount).toBe(3);
  });
});

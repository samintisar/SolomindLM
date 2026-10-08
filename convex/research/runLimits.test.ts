/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./research/index.ts"]);
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

describe("deep research limits", () => {
  test("a Free user is refused before a plan or conversation is created", async () => {
    const { t, notebookId, asUser } = await setup();

    await expect(
      asUser.mutation(api.research.index.startDeepResearch, {
        notebookId,
        query: "How do retrieval-augmented models handle conflicting sources?",
      })
    ).rejects.toThrow("Deep research is a Pro feature");

    const [plans, conversations] = await t.run(async (ctx) => [
      await ctx.db.query("researchPlans").collect(),
      await ctx.db.query("conversations").collect(),
    ]);
    expect(plans).toHaveLength(0);
    expect(conversations).toHaveLength(0);
  });

  test("a plan that has been retried three times can't be retried again", async () => {
    const { t, userId, notebookId, asUser } = await setup();
    const planId = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        userId,
        notebookId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const messageId = await ctx.db.insert("messages", {
        conversationId,
        role: "user",
        content: "q",
        createdAt: Date.now(),
      });
      return ctx.db.insert("researchPlans", {
        userId,
        notebookId,
        conversationId,
        messageId,
        query: "q",
        subQuestions: [],
        sourcePolicy: { channels: ["notebook", "web"] },
        status: "failed",
        workflowId: "wf_1",
        retryCount: 3,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(asUser.mutation(api.research.index.retryDeepResearch, { planId })).rejects.toThrow(
      "already been retried 3 times"
    );
  });
});

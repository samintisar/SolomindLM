/// <reference types="vite/client" />

import { defineSchema } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id, TableNames } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";
import { IDENTITY_TABLES, PURGE_BATCH_SIZE, PURGED_TABLES } from "./_purge";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./account/deletion.ts", "./billing/index.ts"]);

const streamingModules = import.meta.glob(
  "/node_modules/@convex-dev/persistent-text-streaming/dist/component/**/*.js"
) as Record<string, () => Promise<unknown>>;
const streamingSchema = (
  (await streamingModules[
    "/node_modules/@convex-dev/persistent-text-streaming/dist/component/schema.js"
  ]()) as { default: Parameters<ReturnType<typeof convexTest>["registerComponent"]>[1] }
).default;

// Purge tests seed minimal rows (just the ownership links) into every table, so they
// run against the real tables and indexes with document validation switched off.
const looseSchema = defineSchema(schema.tables, { schemaValidation: false });

function setup() {
  const t = convexTest(looseSchema, modules);
  t.registerComponent("persistentTextStreaming", streamingSchema, streamingModules);
  return t;
}

type T = ReturnType<typeof setup>;
type AnyId = Id<TableNames>;

/** Simple tables whose rows point straight at the owner via `userId`. */
const DIRECT_USER_TABLES = [
  "userOnboarding",
  "userPreferences",
  "folders",
  "reports",
  "flashcards",
  "mindmaps",
  "quizzes",
  "infographics",
  "spreadsheets",
  "writtenQuestions",
  "notes",
  "stripeSubscriptions",
  "rateLimits",
  "mobilePushTokens",
  "searchAnalytics",
  "literatureTables",
  "literatureReports",
  "feedback",
] as const satisfies readonly TableNames[];

/**
 * Seeds one row of every kind of user data for `email`, returning the user id, every
 * row id created, and every stored file id.
 */
async function seedUser(t: T, email: string) {
  return t.run(async (ctx) => {
    const ids: AnyId[] = [];
    const add = async <Table extends TableNames>(table: Table, doc: Record<string, unknown>) => {
      // biome-ignore lint/suspicious/noExplicitAny: validation is off; rows carry only links.
      const id = (await ctx.db.insert(table, doc as any)) as Id<Table>;
      ids.push(id);
      return id;
    };

    const userId = await add("users", { email });
    const accountId = await add("authAccounts", {
      userId,
      provider: "password",
      providerAccountId: email,
    });
    await add("authVerificationCodes", { accountId, code: `code-${email}` });
    const sessionId = await add("authSessions", { userId });
    await add("authRefreshTokens", { sessionId });
    await add("authRateLimits", { identifier: email });

    for (const table of DIRECT_USER_TABLES) {
      await add(table, { userId });
    }

    const notebookId = await add("notebooks", { userId });
    await add("notebookShareLinks", { notebookId, createdByUserId: userId });
    await add("notebookMembers", { notebookId, userId });

    const fileId = await ctx.storage.store(new Blob([`file-${email}`]));
    const documentId = await add("documents", { userId, notebookId, storageId: fileId });
    for (let i = 0; i < 3; i++) await add("documentChunks", { documentId, userId, notebookId });

    const conversationId = await add("conversations", { userId, notebookId });
    await add("messages", { conversationId });

    // Deep-research workflow steps are keyed by plan id; run steps by run id.
    const planId = await add("researchPlans", { userId });
    await add("researchSteps", { researchId: planId, userId });
    const runId = await add("researchRuns", { userId, planId });
    await add("researchEvidence", { runId });
    await add("researchSteps", { researchId: runId, userId });

    const sessionIdLr = await add("literatureReviewSessions", { userId });
    await add("literatureReviewScreeningDecisions", { sessionId: sessionIdLr });
    await add("literatureTableDrafts", { sessionId: sessionIdLr });
    await add("literatureReviewRankedPapers", { sessionId: sessionIdLr });
    await add("researchSteps", { researchId: sessionIdLr });

    const promptId = await add("studioPrompts", { userId });
    await add("studioPromptSaves", { userId, publicPromptId: promptId });
    await add("studioPromptRatings", { userId, publicPromptId: promptId });
    await add("studioPromptReports", { promptId, reporterUserId: userId });

    const audioFileId = await ctx.storage.store(new Blob([`audio-${email}`]));
    const audioUrl = await ctx.storage.getUrl(audioFileId);
    await add("audioOverviews", { userId, audioUrl, audioStorageId: audioFileId });

    return { userId, ids, fileIds: [fileId, audioFileId] };
  });
}

async function deleteAndDrain(t: T, userId: Id<"users">) {
  await t.mutation(internal.account.deletion.deleteUserIdentity, { userId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("account deletion", () => {
  test("removes the user, their sign-in records, rows and files, and nothing of anyone else's", async () => {
    const t = setup();
    const doomed = await seedUser(t, "doomed@example.com");
    const keeper = await seedUser(t, "keeper@example.com");

    await deleteAndDrain(t, doomed.userId);

    await t.run(async (ctx) => {
      for (const id of doomed.ids) {
        expect(await ctx.db.get(id), `row ${id} should be deleted`).toBeNull();
      }
      for (const id of keeper.ids) {
        expect(await ctx.db.get(id), `row ${id} should survive`).not.toBeNull();
      }
      for (const fileId of doomed.fileIds) {
        expect(await ctx.storage.get(fileId)).toBeNull();
      }
      for (const fileId of keeper.fileIds) {
        expect(await ctx.storage.get(fileId)).not.toBeNull();
      }
    });
  });

  test("deletes other users' saves, ratings and reports of the user's public prompts", async () => {
    const t = setup();
    const doomed = await seedUser(t, "doomed@example.com");
    const other = await seedUser(t, "other@example.com");
    const doomedPromptId = await t.run(async (ctx) => {
      const prompt = await ctx.db
        .query("studioPrompts")
        .withIndex("by_user", (q) => q.eq("userId", doomed.userId))
        .first();
      return prompt!._id;
    });
    const crossIds = await t.run(async (ctx) => {
      const loose = (doc: Record<string, unknown>) => doc as never;
      return [
        await ctx.db.insert(
          "studioPromptSaves",
          loose({ userId: other.userId, publicPromptId: doomedPromptId })
        ),
        await ctx.db.insert(
          "studioPromptRatings",
          loose({ userId: other.userId, publicPromptId: doomedPromptId })
        ),
        await ctx.db.insert(
          "studioPromptReports",
          loose({ promptId: doomedPromptId, reporterUserId: other.userId })
        ),
      ];
    });

    await deleteAndDrain(t, doomed.userId);

    await t.run(async (ctx) => {
      for (const id of crossIds) expect(await ctx.db.get(id)).toBeNull();
      for (const id of other.ids) expect(await ctx.db.get(id)).not.toBeNull();
    });
  });

  test("drains accounts larger than one batch across scheduled transactions", async () => {
    const t = setup();
    const { userId } = await seedUser(t, "big@example.com");
    const total = PURGE_BATCH_SIZE * 2 + 50;
    await t.run(async (ctx) => {
      const documentId = (await ctx.db
        .query("documents")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first())!._id;
      for (let i = 0; i < total; i++) {
        await ctx.db.insert("documentChunks", { documentId, userId } as never);
      }
    });

    await deleteAndDrain(t, userId);

    await t.run(async (ctx) => {
      expect(await ctx.db.query("documentChunks").take(1)).toHaveLength(0);
      expect(await ctx.db.query("documents").take(1)).toHaveLength(0);
    });
  });

  test("schedules a second full pass after access tokens issued before deletion expire", async () => {
    const t = setup();
    const { userId } = await seedUser(t, "late@example.com");
    const deletedAt = Date.now();

    await t.mutation(internal.account.deletion.deleteUserIdentity, { userId });

    const runTimes = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect())
        .filter((job) => job.name.includes("purgeUserData"))
        .map((job) => job.scheduledTime - deletedAt)
    );
    expect(runTimes.some((delay) => delay < 1000)).toBe(true);
    expect(runTimes.some((delay) => delay > 60 * 60 * 1000)).toBe(true);
  });

  test("is a no-op for a user that no longer exists", async () => {
    const t = setup();
    const { userId } = await seedUser(t, "gone@example.com");
    await deleteAndDrain(t, userId);

    await expect(deleteAndDrain(t, userId)).resolves.toBeUndefined();
  });

  test("covers every table that references a user", () => {
    const covered = new Set<string>([...PURGED_TABLES, ...IDENTITY_TABLES]);
    const referencing = Object.entries(schema.tables)
      .filter(([, table]) => JSON.stringify(table.validator.json).includes('"tableName":"users"'))
      .map(([name]) => name);

    expect(referencing.length).toBeGreaterThan(20);
    expect(referencing.filter((name) => !covered.has(name))).toEqual([]);
  });
});

describe("Stripe webhooks after account deletion", () => {
  const subscriptionArgs = {
    stripeSubscriptionId: "sub_deleted",
    stripeCustomerId: "cus_deleted",
    stripePriceId: "price_1",
    status: "canceled",
    currentPeriodStart: 0,
    currentPeriodEnd: 0,
    cancelAtPeriodEnd: false,
    interval: "month",
    amount: 1500,
    currency: "usd",
  };

  test("a subscription update for a deleted user does not recreate its row", async () => {
    const t = setup();
    const { userId } = await seedUser(t, "gone@example.com");
    await deleteAndDrain(t, userId);

    await t.mutation(internal.billing.index.applyWebhookSubscriptionUpdate, {
      ...subscriptionArgs,
      userId,
    });
    await t.mutation(internal.billing.index.upsertSubscription, { ...subscriptionArgs, userId });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("stripeSubscriptions").take(1)).toHaveLength(0);
    });
  });
});

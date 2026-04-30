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

function withAuth(t: ReturnType<typeof convexTest>, userId: string) {
  return t.withIdentity({ subject: `${userId}|session1` });
}

async function makeUserAndOnboarding(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "U" });
    await ctx.db.insert("userOnboarding", {
      userId,
      tourStatus: "active",
      currentStepId: "createNotebook",
      checklistDismissed: false,
    });
    return userId;
  });
}

async function insertNotebook(
  t: ReturnType<typeof convexTest>,
  userId: string,
  title = "N1",
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("notebooks", {
      userId: userId as never,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function insertDocument(
  t: ReturnType<typeof convexTest>,
  userId: string,
  notebookId: string,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("documents", {
      userId: userId as never,
      notebookId: notebookId as never,
      fileName: "doc",
      fileType: "text",
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function insertConversation(
  t: ReturnType<typeof convexTest>,
  userId: string,
  notebookId: string,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("conversations", {
      userId: userId as never,
      notebookId: notebookId as never,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

describe("getChecklistProgress", () => {
  test("all false for user with no data", async () => {
    const t = convexTest(schema, modules);
    const userId = await makeUserAndOnboarding(t);
    const result = await withAuth(t, userId).query(
      api.onboarding.progress.getChecklistProgress,
      {},
    );
    expect(result).toEqual({
      createNotebook: false,
      addSource: false,
      askQuestion: false,
      openStudio: false,
      generateArtifact: false,
    });
  });

  test("createNotebook=true after inserting any notebook", async () => {
    const t = convexTest(schema, modules);
    const userId = await makeUserAndOnboarding(t);
    await insertNotebook(t, userId);
    const result = await withAuth(t, userId).query(
      api.onboarding.progress.getChecklistProgress,
      {},
    );
    expect(result.createNotebook).toBe(true);
  });

  test("addSource=true after inserting a document for any of user's notebooks", async () => {
    const t = convexTest(schema, modules);
    const userId = await makeUserAndOnboarding(t);
    const nbId = await insertNotebook(t, userId);
    await insertDocument(t, userId, nbId);
    const result = await withAuth(t, userId).query(
      api.onboarding.progress.getChecklistProgress,
      {},
    );
    expect(result.addSource).toBe(true);
  });

  test("askQuestion=true after inserting a conversation", async () => {
    const t = convexTest(schema, modules);
    const userId = await makeUserAndOnboarding(t);
    const nbId = await insertNotebook(t, userId);
    await insertConversation(t, userId, nbId);
    const result = await withAuth(t, userId).query(
      api.onboarding.progress.getChecklistProgress,
      {},
    );
    expect(result.askQuestion).toBe(true);
  });

  test("auth-scoped: another user's notebooks do not tick this user's checklist", async () => {
    const t = convexTest(schema, modules);
    const userA = await makeUserAndOnboarding(t);
    const userB = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "B" }),
    );
    await insertNotebook(t, userB, "B's");
    const result = await withAuth(t, userA).query(
      api.onboarding.progress.getChecklistProgress,
      {},
    );
    expect(result.createNotebook).toBe(false);
  });
});

describe("getTourProgress", () => {
  test("returns tourNotebookId from row", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "U" }),
    );
    const nbId = await insertNotebook(t, userId, "Tour");
    await t.run(async (ctx) =>
      ctx.db.insert("userOnboarding", {
        userId,
        tourStatus: "active",
        currentStepId: "addSource",
        tourNotebookId: nbId,
        checklistDismissed: false,
      }),
    );
    const result = await withAuth(t, userId).query(
      api.onboarding.progress.getTourProgress,
      {},
    );
    expect(result.tourNotebookId).toBe(nbId);
  });

  test("addSource=true only when document is in tourNotebookId", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "U" }),
    );
    const tourNb = await insertNotebook(t, userId, "Tour");
    const otherNb = await insertNotebook(t, userId, "Other");
    await t.run(async (ctx) =>
      ctx.db.insert("userOnboarding", {
        userId,
        tourStatus: "active",
        currentStepId: "addSource",
        tourNotebookId: tourNb,
        checklistDismissed: false,
      }),
    );
    await insertDocument(t, userId, otherNb);
    let result = await withAuth(t, userId).query(
      api.onboarding.progress.getTourProgress,
      {},
    );
    expect(result.addSource).toBe(false);

    await insertDocument(t, userId, tourNb);
    result = await withAuth(t, userId).query(
      api.onboarding.progress.getTourProgress,
      {},
    );
    expect(result.addSource).toBe(true);
  });

  test("askQuestion=true only when conversation is in tourNotebookId", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "U" }),
    );
    const tourNb = await insertNotebook(t, userId, "Tour");
    const otherNb = await insertNotebook(t, userId, "Other");
    await t.run(async (ctx) =>
      ctx.db.insert("userOnboarding", {
        userId,
        tourStatus: "active",
        currentStepId: "askQuestion",
        tourNotebookId: tourNb,
        checklistDismissed: false,
      }),
    );
    await insertConversation(t, userId, otherNb);
    let result = await withAuth(t, userId).query(
      api.onboarding.progress.getTourProgress,
      {},
    );
    expect(result.askQuestion).toBe(false);

    await insertConversation(t, userId, tourNb);
    result = await withAuth(t, userId).query(
      api.onboarding.progress.getTourProgress,
      {},
    );
    expect(result.askQuestion).toBe(true);
  });

  test("openStudio is always false from server (provider overlays its own state)", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "U" }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("userOnboarding", {
        userId,
        tourStatus: "active",
        currentStepId: "openStudio",
        checklistDismissed: false,
      }),
    );
    const result = await withAuth(t, userId).query(
      api.onboarding.progress.getTourProgress,
      {},
    );
    expect(result.openStudio).toBe(false);
  });
});

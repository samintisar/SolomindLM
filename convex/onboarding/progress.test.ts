/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

function withAuth(t: ReturnType<typeof convexTest>, userId: string) {
  return t.withIdentity({ subject: `${userId}|session1` });
}

async function makeUserAndOnboarding(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "U" });
    const startedAt = Date.now() - 60_000;
    await ctx.db.insert("userOnboarding", {
      userId,
      tourStatus: "active",
      currentStepId: "createNotebook",
      checklistDismissed: false,
      startedAt,
    });
    return userId;
  });
}

async function insertNotebook(t: ReturnType<typeof convexTest>, userId: string, title = "N1") {
  return await t.run(async (ctx) =>
    ctx.db.insert("notebooks", {
      userId: userId as never,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function insertDocument(
  t: ReturnType<typeof convexTest>,
  userId: string,
  notebookId: string
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
    })
  );
}

async function insertConversation(
  t: ReturnType<typeof convexTest>,
  userId: string,
  notebookId: string
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("conversations", {
      userId: userId as never,
      notebookId: notebookId as never,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

describe("getChecklistProgress", () => {
  test("all false for user with no data", async () => {
    const t = convexTest(schema, modules);
    const userId = await makeUserAndOnboarding(t);
    const result = await withAuth(t, userId).query(
      api.onboarding.progress.getChecklistProgress,
      {}
    );
    expect(result).toEqual({
      createNotebook: false,
      addSource: false,
      askQuestion: false,
      generateArtifact: false,
    });
  });

  test("createNotebook=true after inserting any notebook", async () => {
    const t = convexTest(schema, modules);
    const userId = await makeUserAndOnboarding(t);
    await insertNotebook(t, userId);
    const result = await withAuth(t, userId).query(
      api.onboarding.progress.getChecklistProgress,
      {}
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
      {}
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
      {}
    );
    expect(result.askQuestion).toBe(true);
  });

  test("generateArtifact=true after inserting a report (global path)", async () => {
    const t = convexTest(schema, modules);
    const userId = await makeUserAndOnboarding(t);
    const nbId = await insertNotebook(t, userId);
    await t.run(async (ctx) =>
      ctx.db.insert("reports", {
        userId: userId as never,
        notebookId: nbId as never,
        title: "Test Report",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const result = await withAuth(t, userId).query(
      api.onboarding.progress.getChecklistProgress,
      {}
    );
    expect(result.generateArtifact).toBe(true);
  });

  test("generateArtifact=true when report is in tourNotebookId (active tour path)", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { name: "U" }));
    const nbId = await insertNotebook(t, userId, "Tour");
    await t.run(async (ctx) =>
      ctx.db.insert("userOnboarding", {
        userId,
        tourStatus: "active",
        currentStepId: "generateArtifact",
        tourNotebookId: nbId,
        checklistDismissed: false,
      })
    );
    await t.run(async (ctx) =>
      ctx.db.insert("reports", {
        userId: userId as never,
        notebookId: nbId as never,
        title: "Tour Report",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const result = await withAuth(t, userId).query(
      api.onboarding.progress.getChecklistProgress,
      {}
    );
    expect(result.generateArtifact).toBe(true);
  });

  test("auth-scoped: another user's notebooks do not tick this user's checklist", async () => {
    const t = convexTest(schema, modules);
    const userA = await makeUserAndOnboarding(t);
    const userB = await t.run(async (ctx) => ctx.db.insert("users", { name: "B" }));
    await insertNotebook(t, userB, "B's");
    const result = await withAuth(t, userA).query(api.onboarding.progress.getChecklistProgress, {});
    expect(result.createNotebook).toBe(false);
  });

  test("uses global progress when tour is not active", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const uid = await ctx.db.insert("users", { name: "U" });
      await ctx.db.insert("userOnboarding", {
        userId: uid,
        tourStatus: "completed",
        checklistDismissed: false,
        completedAt: Date.now(),
      });
      return uid;
    });
    await insertNotebook(t, userId);
    const result = await withAuth(t, userId).query(
      api.onboarding.progress.getChecklistProgress,
      {}
    );
    expect(result.createNotebook).toBe(true);
  });

  test("while tour active, ignores notebooks created before current startedAt (restart)", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const uid = await ctx.db.insert("users", { name: "U" });
      await ctx.db.insert("notebooks", {
        userId: uid as never,
        title: "Before restart",
        createdAt: Date.now() - 86_400_000,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("userOnboarding", {
        userId: uid,
        tourStatus: "active",
        currentStepId: "createNotebook",
        checklistDismissed: false,
        startedAt: Date.now(),
      });
      return uid;
    });
    const result = await withAuth(t, userId).query(
      api.onboarding.progress.getChecklistProgress,
      {}
    );
    expect(result.createNotebook).toBe(false);
  });
});

describe("getTourProgress", () => {
  test("returns tourNotebookId from row", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { name: "U" }));
    const nbId = await insertNotebook(t, userId, "Tour");
    await t.run(async (ctx) =>
      ctx.db.insert("userOnboarding", {
        userId,
        tourStatus: "active",
        currentStepId: "addSource",
        tourNotebookId: nbId,
        checklistDismissed: false,
      })
    );
    const result = await withAuth(t, userId).query(api.onboarding.progress.getTourProgress, {});
    expect(result.tourNotebookId).toBe(nbId);
  });

  test("addSource=true only when document is in tourNotebookId", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { name: "U" }));
    const tourNb = await insertNotebook(t, userId, "Tour");
    const otherNb = await insertNotebook(t, userId, "Other");
    await t.run(async (ctx) =>
      ctx.db.insert("userOnboarding", {
        userId,
        tourStatus: "active",
        currentStepId: "addSource",
        tourNotebookId: tourNb,
        checklistDismissed: false,
      })
    );
    await insertDocument(t, userId, otherNb);
    let result = await withAuth(t, userId).query(api.onboarding.progress.getTourProgress, {});
    expect(result.addSource).toBe(false);

    await insertDocument(t, userId, tourNb);
    result = await withAuth(t, userId).query(api.onboarding.progress.getTourProgress, {});
    expect(result.addSource).toBe(true);
  });

  test("askQuestion=true only when conversation is in tourNotebookId", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { name: "U" }));
    const tourNb = await insertNotebook(t, userId, "Tour");
    const otherNb = await insertNotebook(t, userId, "Other");
    await t.run(async (ctx) =>
      ctx.db.insert("userOnboarding", {
        userId,
        tourStatus: "active",
        currentStepId: "askQuestion",
        tourNotebookId: tourNb,
        checklistDismissed: false,
      })
    );
    await insertConversation(t, userId, otherNb);
    let result = await withAuth(t, userId).query(api.onboarding.progress.getTourProgress, {});
    expect(result.askQuestion).toBe(false);

    await insertConversation(t, userId, tourNb);
    result = await withAuth(t, userId).query(api.onboarding.progress.getTourProgress, {});
    expect(result.askQuestion).toBe(true);
  });

  test("falls back to first notebook created since startedAt", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { name: "U" }));
    await t.run(async (ctx) => {
      await ctx.db.insert("notebooks", {
        userId: userId as never,
        title: "Before start",
        createdAt: Date.now() - 300_000,
        updatedAt: Date.now() - 300_000,
      });
      await ctx.db.insert("userOnboarding", {
        userId,
        tourStatus: "active",
        currentStepId: "createNotebook",
        checklistDismissed: false,
        startedAt: Date.now() - 30_000,
      });
    });
    const expectedNotebookId = await t.run(async (ctx) =>
      ctx.db.insert("notebooks", {
        userId: userId as never,
        title: "After start",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const result = await withAuth(t, userId).query(api.onboarding.progress.getTourProgress, {});
    expect(result.tourNotebookId).toBe(expectedNotebookId);
  });
});

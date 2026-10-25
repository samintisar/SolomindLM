/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, [
  "./notes/index.ts",
  "./notes/userNotes.ts",
  "./studio/reports/index.ts",
  "./studio/jobMutations/reports.ts",
  "./_migration/backfillStudioItems.ts",
]);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

/**
 * A notebook with a report and a flashcard set written straight to the tables (as before the
 * index existed), so it has no `studioItems` rows yet.
 */
async function setup() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Owner" });
    const editor = await ctx.db.insert("users", { name: "Editor" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Notebook",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("notebookMembers", {
      notebookId,
      userId: editor,
      role: "editor",
      joinedAt: now,
    });
    const base = { userId: owner, notebookId, createdAt: now, updatedAt: now };
    const reportId = await ctx.db.insert("reports", {
      ...base,
      title: "Report",
      status: "generating",
      content: "x".repeat(5_000),
      metadata: { phase: "map_processing", totalMapTasks: 3, mapResults: { 0: "a", 1: "b" } },
    });
    const flashcardId = await ctx.db.insert("flashcards", {
      ...base,
      updatedAt: now - 1_000,
      title: "Deck",
      status: "completed",
      cardsData: [{ front: "Q", back: "A" }],
    });
    return { owner, editor, notebookId, reportId, flashcardId };
  });
  return { t, ...ids };
}

async function studioItems(t: ReturnType<typeof convexTest>) {
  return await t.run((ctx) => ctx.db.query("studioItems").collect());
}

async function indexStatus(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => (await ctx.db.query("studioItemIndexes").first())?.status);
}

/** Runs the background indexing a notebook's first write schedules. */
async function drainScheduled(t: ReturnType<typeof convexTest>) {
  await t.finishAllScheduledFunctions(() => {});
}

describe("studioItems", () => {
  test("a notebook without rows is listed from the output tables", async () => {
    const { t, owner, notebookId } = await setup();

    const rows = await withAuth(t, owner).query(api.notes.index.list, { notebookId });

    expect(rows.map((row) => row._type)).toEqual(["report", "flashcard"]);
    expect(rows[0]).not.toHaveProperty("content");
    expect(rows[0].metadata).toEqual({
      phase: "map_processing",
      totalMapTasks: 3,
      completedMapTasks: 2,
    });
    expect(rows[1]).toMatchObject({ _cardsCount: 1 });
    expect(await studioItems(t)).toHaveLength(0);
  });

  test("the first write in a notebook indexes its own row and schedules the rest", async () => {
    const { t, owner, notebookId, reportId, flashcardId } = await setup();
    const before = await withAuth(t, owner).query(api.notes.index.list, { notebookId });

    await t.mutation(internal.studio.jobMutations.reports.updateReportStatus, {
      reportId,
      status: "generating",
      metadata: { phase: "reduce", progress: 80, mapResults: { 0: "a", 1: "b", 2: "c" } },
    });

    // The job's mutation wrote only the report's row; the list still reads the output tables.
    expect((await studioItems(t)).map((item) => item.itemId)).toEqual([reportId]);
    expect(await indexStatus(t)).toBe("indexing");
    let rows = await withAuth(t, owner).query(api.notes.index.list, { notebookId });
    expect(rows.map((row) => row._id)).toEqual(before.map((row) => row._id));

    await drainScheduled(t);

    expect(await indexStatus(t)).toBe("done");
    const items = await studioItems(t);
    expect(items.map((item) => item.itemId).sort()).toEqual([reportId, flashcardId].sort());
    rows = await withAuth(t, owner).query(api.notes.index.list, { notebookId });
    expect(rows.map((row) => row._id)).toEqual(before.map((row) => row._id));
    expect(rows[0].metadata).toEqual({ phase: "reduce", progress: 80, completedMapTasks: 3 });
  });

  test("a large notebook is indexed a page at a time, not in the writing mutation", async () => {
    const { t, owner, notebookId, reportId } = await setup();
    // Far more payload than one mutation should read: 40 reports of 200 KB each.
    const bigIds = await t.run(async (ctx) => {
      const ids: string[] = [];
      for (let i = 0; i < 40; i++) {
        ids.push(
          await ctx.db.insert("reports", {
            userId: owner,
            notebookId,
            title: `Big ${i}`,
            status: "completed",
            content: "y".repeat(200_000),
            createdAt: i,
            updatedAt: i,
          })
        );
      }
      return ids;
    });

    await t.mutation(internal.studio.reports.index.updateStatus, { reportId, status: "failed" });
    expect(await studioItems(t)).toHaveLength(1);

    await drainScheduled(t);

    const items = await studioItems(t);
    expect(items).toHaveLength(42);
    expect(items.every((item) => !("content" in (item.row as object)))).toBe(true);
    const rows = await withAuth(t, owner).query(api.notes.index.list, { notebookId });
    expect(rows.map((row) => row._id)).toEqual(expect.arrayContaining([reportId, ...bigIds]));
  });

  test("rows follow patches and deletes", async () => {
    const { t, owner, notebookId, reportId, flashcardId } = await setup();
    await t.mutation(internal.studio.reports.index.updateStatus, { reportId, status: "failed" });
    await drainScheduled(t);

    let rows = await withAuth(t, owner).query(api.notes.index.list, { notebookId });
    expect(rows.find((row) => row._id === reportId)?.status).toBe("failed");

    await withAuth(t, owner).mutation(api.studio.reports.index.remove, { id: reportId });

    rows = await withAuth(t, owner).query(api.notes.index.list, { notebookId });
    expect(rows.map((row) => row._id)).toEqual([flashcardId]);
    expect((await studioItems(t)).map((item) => item.itemId)).toEqual([flashcardId]);
  });

  test("a saved chat is listed only for its author", async () => {
    const { t, owner, editor, notebookId } = await setup();
    await t.mutation(internal.notes.userNotes.createInternal, {
      userId: owner,
      notebookId,
      type: "chat",
      title: "Saved chat",
      messages: [{ role: "user", content: "hi" }],
    });
    await t.mutation(internal.notes.userNotes.createInternal, {
      userId: owner,
      notebookId,
      type: "manual",
      title: "Manual note",
      content: "body",
    });
    await drainScheduled(t);

    const ownerRows = await withAuth(t, owner).query(api.notes.index.list, { notebookId });
    const editorRows = await withAuth(t, editor).query(api.notes.index.list, { notebookId });

    expect(ownerRows.map((row) => row.title)).toContain("Saved chat");
    expect(ownerRows.find((row) => row.title === "Saved chat")).not.toHaveProperty("messages");
    expect(editorRows.map((row) => row.title)).not.toContain("Saved chat");
    expect(editorRows.map((row) => row.title)).toContain("Manual note");
  });

  test("filters by table name", async () => {
    const { t, owner, notebookId, reportId } = await setup();
    await t.mutation(internal.studio.reports.index.updateStatus, { reportId, status: "completed" });
    await drainScheduled(t);

    const rows = await withAuth(t, owner).query(api.notes.index.list, {
      notebookId,
      types: ["flashcards"],
    });

    expect(rows.map((row) => row._type)).toEqual(["flashcard"]);
  });

  test("the backfill indexes notebooks not indexed yet and is safe to rerun", async () => {
    const { t, reportId, flashcardId } = await setup();

    await t.mutation(internal._migration.backfillStudioItems.start, {});
    await t.finishAllScheduledFunctions(() => {});
    await t.mutation(internal._migration.backfillStudioItems.start, {});
    await t.finishAllScheduledFunctions(() => {});

    expect(await indexStatus(t)).toBe("done");
    const items = await studioItems(t);
    expect(items.map((item) => item.itemId).sort()).toEqual([reportId, flashcardId].sort());
    const report = items.find((item) => item.itemId === reportId);
    expect(report?.row).not.toHaveProperty("content");
  });
});

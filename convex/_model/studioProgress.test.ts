/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import {
  deleteProgressRows,
  getPracticeTarget,
  getViewerProgress,
  listViewerProgressByItem,
  saveViewerProgress,
} from "./studioProgress";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

async function setup() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Owner" });
    const editor = await ctx.db.insert("users", { name: "Editor" });
    const viewer = await ctx.db.insert("users", { name: "Viewer" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Public",
      isPublic: true,
      createdAt: now,
      updatedAt: now,
    });
    const privateNotebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Private",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("notebookMembers", {
      notebookId,
      userId: editor,
      role: "editor",
      joinedAt: now,
    });
    return { owner, editor, viewer, notebookId, privateNotebookId };
  });
  return { t, ...ids };
}

function key(userId: Id<"users">, notebookId: Id<"notebooks">, itemId: string) {
  return { userId, notebookId, itemId, itemType: "quizzes" as const };
}

describe("getPracticeTarget", () => {
  test("owners and editors practise on the shared row, a public notebook's viewer on their own", async () => {
    const { t, owner, editor, viewer, notebookId } = await setup();
    await t.run(async (ctx) => {
      expect(await getPracticeTarget(ctx, notebookId, owner)).toBe("shared");
      expect(await getPracticeTarget(ctx, notebookId, editor)).toBe("shared");
      expect(await getPracticeTarget(ctx, notebookId, viewer)).toBe("viewer");
    });
  });

  test("anyone else is refused", async () => {
    const { t, viewer, privateNotebookId } = await setup();
    await expect(t.run((ctx) => getPracticeTarget(ctx, privateNotebookId, viewer))).rejects.toThrow(
      "Notebook not found"
    );
  });
});

describe("saveViewerProgress", () => {
  test("creates the viewer's row, then updates it in place", async () => {
    const { t, viewer, notebookId } = await setup();
    await t.run(async (ctx) => {
      await saveViewerProgress(ctx, key(viewer, notebookId, "quiz1"), () => ({
        userAnswers: { 0: 1 },
      }));
      await saveViewerProgress(ctx, key(viewer, notebookId, "quiz1"), (current) => ({
        ...(current as object),
        lastViewedIndex: 2,
      }));
      const rows = await ctx.db.query("studioProgress").collect();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId: viewer,
        notebookId,
        itemType: "quizzes",
        itemId: "quiz1",
        progress: { userAnswers: { 0: 1 }, lastViewedIndex: 2 },
      });
      expect((await getViewerProgress(ctx, viewer, "quiz1"))?.progress).toEqual(rows[0].progress);
    });
  });
});

describe("listViewerProgressByItem", () => {
  test("returns only this viewer's progress in this notebook, by item", async () => {
    const { t, owner, viewer, notebookId, privateNotebookId } = await setup();
    await t.run(async (ctx) => {
      await saveViewerProgress(ctx, key(viewer, notebookId, "a"), () => ({ lastViewedIndex: 1 }));
      await saveViewerProgress(ctx, key(owner, notebookId, "a"), () => ({ lastViewedIndex: 9 }));
      await saveViewerProgress(ctx, key(viewer, privateNotebookId, "b"), () => ({}));
      const byItem = await listViewerProgressByItem(ctx, viewer, notebookId);
      expect([...byItem.entries()]).toEqual([["a", { lastViewedIndex: 1 }]]);
    });
  });
});

describe("deleteProgressRows", () => {
  test("deletes by item or by notebook, at most `limit` at a time", async () => {
    const { t, owner, viewer, notebookId, privateNotebookId } = await setup();
    await t.run(async (ctx) => {
      await saveViewerProgress(ctx, key(viewer, notebookId, "a"), () => ({}));
      await saveViewerProgress(ctx, key(owner, notebookId, "a"), () => ({}));
      await saveViewerProgress(ctx, key(viewer, notebookId, "b"), () => ({}));
      await saveViewerProgress(ctx, key(viewer, privateNotebookId, "c"), () => ({}));

      expect(await deleteProgressRows(ctx, { itemId: "a" }, 1)).toBe(false);
      expect(await deleteProgressRows(ctx, { itemId: "a" }, 10)).toBe(true);
      expect(await deleteProgressRows(ctx, { notebookId }, 10)).toBe(true);
      const left = await ctx.db.query("studioProgress").collect();
      expect(left.map((row) => row.itemId)).toEqual(["c"]);
    });
  });
});

/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";
import { performNotebookFork } from "./_forkNotebook";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./notebooks/index.ts"]);

describe("performNotebookFork mind maps", () => {
  test("a forked mind map points at the fork's own sources", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { notebookId, docId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { name: "Owner" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: ownerId,
        title: "Original",
        createdAt: now,
        updatedAt: now,
      });
      const docId = await ctx.db.insert("documents", {
        userId: ownerId,
        notebookId,
        fileName: "notes.txt",
        fileType: "text",
        status: "completed",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("mindmaps", {
        userId: ownerId,
        notebookId,
        title: "Map",
        data: {},
        status: "completed",
        metadata: { documentIds: [docId, "not-a-copied-doc"], nodeCount: 3 },
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("mindmaps", {
        userId: ownerId,
        notebookId,
        title: "Old map",
        data: {},
        status: "completed",
        metadata: { nodeCount: 1 },
        createdAt: now,
        updatedAt: now,
      });
      return { notebookId, docId };
    });

    const forkerId = await t.run((ctx) => ctx.db.insert("users", { name: "Forker" }));
    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));

    const { forkedDocs, forkedMaps } = await t.run(async (ctx) => ({
      forkedDocs: await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect(),
      forkedMaps: await ctx.db
        .query("mindmaps")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect(),
    }));

    expect(forkedDocs).toHaveLength(1);
    expect(forkedDocs[0]._id).not.toBe(docId);
    const map = forkedMaps.find((m) => m.title === "Map");
    expect(map?.metadata).toEqual({ documentIds: [forkedDocs[0]._id], nodeCount: 3 });
    const old = forkedMaps.find((m) => m.title === "Old map");
    expect(old?.metadata).toEqual({ nodeCount: 1 });
  });
});

describe("performNotebookFork infographics", () => {
  test("a forked infographic points at the fork's own sources", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { notebookId, docId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { name: "Owner" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: ownerId,
        title: "Original",
        createdAt: now,
        updatedAt: now,
      });
      const docId = await ctx.db.insert("documents", {
        userId: ownerId,
        notebookId,
        fileName: "notes.txt",
        fileType: "text",
        status: "completed",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("infographics", {
        userId: ownerId,
        notebookId,
        title: "Chart",
        data: {
          imageUrl: "https://example.com/chart.png",
          metadata: { sourceDocumentIds: [docId, "not-a-copied-doc"], orientation: "portrait" },
        },
        status: "completed",
        metadata: { sourceDocumentIds: [docId, "not-a-copied-doc"], visualStyle: "flat" },
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("infographics", {
        userId: ownerId,
        notebookId,
        title: "Draft",
        data: {},
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });
      return { notebookId, docId };
    });

    const forkerId = await t.run((ctx) => ctx.db.insert("users", { name: "Forker" }));
    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));

    const { forkedDocs, forkedInfographics } = await t.run(async (ctx) => ({
      forkedDocs: await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect(),
      forkedInfographics: await ctx.db
        .query("infographics")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect(),
    }));

    expect(forkedDocs).toHaveLength(1);
    const forkedDocId = forkedDocs[0]._id;
    expect(forkedDocId).not.toBe(docId);
    const chart = forkedInfographics.find((i) => i.title === "Chart");
    expect(chart?.metadata).toEqual({ sourceDocumentIds: [forkedDocId], visualStyle: "flat" });
    expect(chart?.data).toEqual({
      imageUrl: "https://example.com/chart.png",
      metadata: { sourceDocumentIds: [forkedDocId], orientation: "portrait" },
    });
    const draft = forkedInfographics.find((i) => i.title === "Draft");
    expect(draft?.data).toEqual({});
    expect(draft?.metadata).toBeUndefined();
  });
});

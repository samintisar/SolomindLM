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

describe("performNotebookFork audio overviews", () => {
  test("a forked overview drops the source's synthesis chunk files", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { notebookId, chunkFileId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { name: "Owner" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: ownerId,
        title: "Original",
        createdAt: now,
        updatedAt: now,
      });
      const chunkFileId = await ctx.storage.store(new Blob(["mp3"]));
      await ctx.db.insert("audioOverviews", {
        userId: ownerId,
        notebookId,
        title: "Overview",
        status: "generating",
        metadata: {
          audioType: "deep_dive",
          synthesis: {
            chunks: [{ start: 0, end: 1 }],
            done: { "0": { storageId: chunkFileId, synthesizedLines: 1, failedLines: 0 } },
            startedAt: now,
          },
        },
        createdAt: now,
        updatedAt: now,
      });
      return { notebookId, chunkFileId };
    });

    const forkerId = await t.run((ctx) => ctx.db.insert("users", { name: "Forker" }));
    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));

    const [forked] = await t.run((ctx) =>
      ctx.db
        .query("audioOverviews")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect()
    );
    // Deleting or failing the fork's row deletes the chunk files its metadata names.
    expect(forked.metadata).toEqual({ audioType: "deep_dive" });
    expect(await t.run((ctx) => ctx.db.system.get(chunkFileId))).not.toBeNull();
  });
});

describe("performNotebookFork literature outputs", () => {
  test("copies completed studio tables and reports and relinks the report to the copied table", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { notebookId, citationId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { name: "Owner" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: ownerId,
        title: "Review",
        createdAt: now,
        updatedAt: now,
      });
      const citationId = await ctx.db.insert("citations", {
        paperId: "W1",
        title: "Paper",
        authors: ["A"],
        url: "https://example.org/p",
        sourceApi: "openalex",
        citationKey: "a2020",
      });
      const tableId = await ctx.db.insert("literatureTables", {
        title: "Table",
        notebookId,
        userId: ownerId,
        status: "completed",
        columns: [],
        papers: [{ citationId, rowData: {}, isIncluded: true }],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("literatureTables", {
        title: "Still generating",
        notebookId,
        userId: ownerId,
        status: "generating",
        columns: [],
        papers: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("literatureReports", {
        title: "Report",
        notebookId,
        userId: ownerId,
        status: "completed",
        content: "# Review",
        citationStyle: "apa7",
        sections: [],
        citationIds: [citationId],
        tableId,
        createdAt: now,
        updatedAt: now,
      });
      return { notebookId, citationId };
    });

    const forkerId = await t.run((ctx) => ctx.db.insert("users", { name: "Forker" }));
    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));

    const { tables, reports } = await t.run(async (ctx) => ({
      tables: await ctx.db
        .query("literatureTables")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect(),
      reports: await ctx.db
        .query("literatureReports")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect(),
    }));
    expect(tables.map((r) => r.title)).toEqual(["Table"]);
    expect(tables[0].userId).toBe(forkerId);
    expect(tables[0].papers[0].citationId).toBe(citationId);
    expect(reports).toHaveLength(1);
    expect(reports[0].tableId).toBe(tables[0]._id);
    expect(reports[0].userId).toBe(forkerId);
  });
});

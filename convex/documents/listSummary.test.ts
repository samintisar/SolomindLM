/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { MAX_DOCUMENTS_PER_NOTEBOOK_LIST, MAX_USER_WIDE_DOCUMENTS } from "../_lib/queryCaps";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./documents/listSummary.ts"]);

type T = ReturnType<typeof convexTest>;

function withAuth(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

async function seedUser(t: T): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}

async function seedNotebook(t: T, userId: Id<"users">): Promise<Id<"notebooks">> {
  return t.run(async (ctx) =>
    ctx.db.insert("notebooks", {
      userId,
      title: "Test Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function seedHeavyPaper(
  t: T,
  userId: Id<"users">,
  notebookId: Id<"notebooks">
): Promise<Id<"documents">> {
  return t.run(async (ctx) =>
    ctx.db.insert("documents", {
      userId,
      notebookId,
      fileName: "Attention Is All You Need",
      fileType: "paper_record",
      fileUrl: "https://arxiv.org/abs/1706.03762",
      status: "failed",
      metadata: { userMessage: "Could not fetch the PDF.", internalTrace: "x".repeat(500) },
      extractedMarkdown: "Full source text. ".repeat(1000),
      wordCount: 3000,
      totalChunks: 12,
      fulltextStatus: "available",
      ingestionStatus: "failed",
      paperRecord: {
        abstract: "We propose a new network architecture...",
        authors: ["Vaswani, A.", "Shazeer, N."],
        doi: "10.1234/attention",
        openAlexId: "W123",
        isOa: true,
        pdfUrl: "https://arxiv.org/pdf/1706.03762.pdf",
      },
      sourceGuide: { summary: "A transformer paper.", topics: ["attention"], generatedAt: 1 },
      createdAt: 10,
      updatedAt: 20,
    })
  );
}

describe("documents.listSummary.listSummary", () => {
  test("returns only summary fields; full text and heavy payloads stay out", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const docId = await seedHeavyPaper(t, userId, notebookId);

    const rows = await withAuth(t, userId).query(api.documents.listSummary.listSummary, {
      notebookId,
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).not.toHaveProperty("extractedMarkdown");
    expect(row).not.toHaveProperty("userId");
    expect(row).not.toHaveProperty("updatedAt");
    expect(row).toMatchObject({
      _id: docId,
      fileName: "Attention Is All You Need",
      fileType: "paper_record",
      fileUrl: "https://arxiv.org/abs/1706.03762",
      status: "failed",
      createdAt: 10,
      wordCount: 3000,
      totalChunks: 12,
      fulltextStatus: "available",
      ingestionStatus: "failed",
      sourceGuide: { summary: "A transformer paper.", topics: ["attention"], generatedAt: 1 },
    });
    expect(row.paperRecord).toEqual({ doi: "10.1234/attention", openAlexId: "W123" });
    expect(row.metadata).toEqual({ userMessage: "Could not fetch the PDF." });
  });

  test("omits metadata when there is no string userMessage", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "notes.txt",
        fileType: "text",
        status: "completed",
        metadata: { pages: 3 },
        createdAt: 1,
        updatedAt: 1,
      })
    );

    const rows = await withAuth(t, userId).query(api.documents.listSummary.listSummary, {
      notebookId,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toBeUndefined();
  });

  test("returns empty when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    await seedHeavyPaper(t, userId, notebookId);

    await expect(t.query(api.documents.listSummary.listSummary, { notebookId })).resolves.toEqual(
      []
    );
    await expect(t.query(api.documents.listSummary.listSummary, {})).resolves.toEqual([]);
  });

  test("returns empty for a notebook the user cannot read", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const strangerId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    await seedHeavyPaper(t, ownerId, notebookId);

    const rows = await withAuth(t, strangerId).query(api.documents.listSummary.listSummary, {
      notebookId,
    });
    expect(rows).toEqual([]);
  });

  test("bounds a notebook-scoped list to MAX_DOCUMENTS_PER_NOTEBOOK_LIST, newest first", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const total = MAX_DOCUMENTS_PER_NOTEBOOK_LIST + 5;

    await t.run(async (ctx) => {
      for (let i = 0; i < total; i++) {
        await ctx.db.insert("documents", {
          userId,
          notebookId,
          fileName: `doc-${i}`,
          fileType: "text",
          status: "completed",
          createdAt: i,
          updatedAt: i,
        });
      }
    });

    const rows = await withAuth(t, userId).query(api.documents.listSummary.listSummary, {
      notebookId,
    });
    expect(rows).toHaveLength(MAX_DOCUMENTS_PER_NOTEBOOK_LIST);
    expect(rows[0].fileName).toBe(`doc-${total - 1}`);
  });

  test("without a notebook, returns only the caller's documents, capped at MAX_USER_WIDE_DOCUMENTS", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const otherId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const otherNotebookId = await seedNotebook(t, otherId);
    await seedHeavyPaper(t, otherId, otherNotebookId);
    const total = MAX_USER_WIDE_DOCUMENTS + 3;

    await t.run(async (ctx) => {
      for (let i = 0; i < total; i++) {
        await ctx.db.insert("documents", {
          userId,
          notebookId,
          fileName: `mine-${i}`,
          fileType: "text",
          status: "completed",
          createdAt: i,
          updatedAt: i,
        });
      }
    });

    const rows = await withAuth(t, userId).query(api.documents.listSummary.listSummary, {});
    expect(rows).toHaveLength(MAX_USER_WIDE_DOCUMENTS);
    expect(rows[0].fileName).toBe(`mine-${total - 1}`);
    expect(rows.every((row) => row.fileName.startsWith("mine-"))).toBe(true);
  });
});

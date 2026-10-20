/// <reference types="vite/client" />

import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";
import { FORK_CHUNK_BATCH_SIZE, performNotebookFork } from "./_forkNotebook";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./notebooks/index.ts"]);

describe("performNotebookFork sources", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const MARKDOWN = "# Paper\n\nFull text.";
  const EMBEDDING = Array.from({ length: 1536 }, (_, i) => i / 1536);

  /** One completed source with `chunkCount` chunks; the notebook also has a mind map naming it. */
  async function seedSource(t: ReturnType<typeof convexTest>, chunkCount: number) {
    const now = Date.now();
    return await t.run(async (ctx) => {
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
        fileName: "paper.pdf",
        fileType: "paper_record",
        status: "completed",
        totalChunks: chunkCount,
        extractedMarkdown: MARKDOWN,
        paperRecord: {
          abstract: "An abstract.",
          authors: ["A. Author"],
          doi: "10.1000/x",
          isOa: true,
        },
        fulltextStatus: "available",
        ingestionStatus: "ingested",
        fullTextSource: { method: "oa_pdf", url: "https://example.org/p.pdf" },
        sourceGuide: { summary: "About things.", topics: ["things"], generatedAt: now },
        createdAt: now,
        updatedAt: now,
      });
      for (let i = 0; i < chunkCount; i++) {
        await ctx.db.insert("documentChunks", {
          documentId: docId,
          userId: ownerId,
          notebookId,
          content: `chunk ${i}`,
          chunkIndex: i,
          embedding: i === 0 ? EMBEDDING : undefined,
          pageNumber: 1,
          createdAt: now,
        });
      }
      await ctx.db.insert("mindmaps", {
        userId: ownerId,
        notebookId,
        title: "Map",
        data: {},
        status: "completed",
        metadata: { documentIds: [docId] },
        createdAt: now,
        updatedAt: now,
      });
      const forkerId = await ctx.db.insert("users", { name: "Forker" });
      return { notebookId, docId, forkerId };
    });
  }

  async function forkedSource(t: ReturnType<typeof convexTest>, forkId: Id<"notebooks">) {
    return await t.run(async (ctx) => {
      const [doc] = await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect();
      const chunks = doc
        ? await ctx.db
            .query("documentChunks")
            .withIndex("by_document", (q) => q.eq("documentId", doc._id))
            .collect()
        : [];
      return { doc, chunks };
    });
  }

  test("the fork's source starts processing, without its text or chunks", async () => {
    const t = convexTest(schema, modules);
    const { notebookId, forkerId } = await seedSource(t, 3);

    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));

    const { doc, chunks } = await forkedSource(t, forkId);
    expect(doc.status).toBe("processing");
    expect(doc.extractedMarkdown).toBeUndefined();
    expect(chunks).toHaveLength(0);
  });

  test("copies the text and every chunk across several batches, then completes", async () => {
    const t = convexTest(schema, modules);
    const chunkCount = FORK_CHUNK_BATCH_SIZE * 2 + 5;
    const { notebookId, docId, forkerId } = await seedSource(t, chunkCount);

    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const { doc, chunks } = await forkedSource(t, forkId);
    expect(doc._id).not.toBe(docId);
    expect(doc.status).toBe("completed");
    expect(doc.extractedMarkdown).toBe(MARKDOWN);
    expect(chunks).toHaveLength(chunkCount);
    expect(new Set(chunks.map((c) => c.chunkIndex)).size).toBe(chunkCount);
    expect(chunks.every((c) => c.userId === forkerId && c.notebookId === forkId)).toBe(true);
    const first = chunks.find((c) => c.chunkIndex === 0);
    expect(first?.embedding).toEqual(EMBEDDING);
    expect(first?.pageNumber).toBe(1);

    // The original keeps its own chunks.
    const originalChunks = await t.run((ctx) =>
      ctx.db
        .query("documentChunks")
        .withIndex("by_document", (q) => q.eq("documentId", docId))
        .collect()
    );
    expect(originalChunks).toHaveLength(chunkCount);

    const [map] = await t.run((ctx) =>
      ctx.db
        .query("mindmaps")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect()
    );
    expect(map.metadata).toEqual({ documentIds: [doc._id] });
  });

  test("keeps the source's paper metadata and source guide", async () => {
    const t = convexTest(schema, modules);
    const { notebookId, forkerId } = await seedSource(t, 1);

    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));

    const { doc } = await forkedSource(t, forkId);
    expect(doc).toMatchObject({
      paperRecord: {
        abstract: "An abstract.",
        authors: ["A. Author"],
        doi: "10.1000/x",
        isOa: true,
      },
      fulltextStatus: "available",
      ingestionStatus: "ingested",
      fullTextSource: { method: "oa_pdf", url: "https://example.org/p.pdf" },
      sourceGuide: { summary: "About things.", topics: ["things"] },
    });
  });

  test("stops quietly when the fork's source is deleted mid-copy", async () => {
    const t = convexTest(schema, modules);
    const { notebookId, forkerId } = await seedSource(t, FORK_CHUNK_BATCH_SIZE + 1);

    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));
    const { doc } = await forkedSource(t, forkId);
    await t.run((ctx) => ctx.db.delete(doc._id));
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const chunks = await t.run((ctx) =>
      ctx.db
        .query("documentChunks")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect()
    );
    expect(chunks).toHaveLength(0);
  });

  test("marks the fork's source failed when the original is deleted mid-copy", async () => {
    const t = convexTest(schema, modules);
    const { notebookId, docId, forkerId } = await seedSource(t, 1);

    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));
    await t.run(async (ctx) => {
      for (const chunk of await ctx.db
        .query("documentChunks")
        .withIndex("by_document", (q) => q.eq("documentId", docId))
        .collect()) {
        await ctx.db.delete(chunk._id);
      }
      await ctx.db.delete(docId);
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const { doc, chunks } = await forkedSource(t, forkId);
    expect(doc.status).toBe("failed");
    expect(doc.error).toEqual(expect.any(String));
    expect(chunks).toHaveLength(0);
  });

  test("stops when the fork's notebook has been deleted", async () => {
    const t = convexTest(schema, modules);
    const { notebookId, forkerId } = await seedSource(t, 3);

    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));
    await t.run((ctx) => ctx.db.delete(forkId));
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const { doc, chunks } = await forkedSource(t, forkId);
    expect(chunks).toHaveLength(0);
    expect(doc.extractedMarkdown).toBeUndefined();
  });

  /** Runs only the copy steps already due, so a test can change the original between batches. */
  async function runOneStep(t: ReturnType<typeof convexTest>) {
    vi.runOnlyPendingTimers();
    await t.finishInProgressScheduledFunctions();
  }

  /** What reprocessing does to the original: new chunks, new text, a new `updatedAt`. */
  async function reprocessOriginal(
    t: ReturnType<typeof convexTest>,
    docId: Id<"documents">,
    chunkCount: number,
    status: "processing" | "completed"
  ) {
    await t.run(async (ctx) => {
      const doc = await ctx.db.get(docId);
      if (!doc) throw new Error("missing original");
      for (const chunk of await ctx.db
        .query("documentChunks")
        .withIndex("by_document", (q) => q.eq("documentId", docId))
        .collect()) {
        await ctx.db.delete(chunk._id);
      }
      for (let i = 0; i < chunkCount; i++) {
        await ctx.db.insert("documentChunks", {
          documentId: docId,
          userId: doc.userId,
          notebookId: doc.notebookId,
          content: `new chunk ${i}`,
          chunkIndex: i,
          createdAt: Date.now(),
        });
      }
      await ctx.db.patch(docId, {
        status,
        extractedMarkdown: "# New text",
        totalChunks: chunkCount,
        updatedAt: doc.updatedAt + 1,
      });
    });
  }

  test("starts over when the original is reprocessed mid-copy", async () => {
    const t = convexTest(schema, modules);
    const { notebookId, docId, forkerId } = await seedSource(t, FORK_CHUNK_BATCH_SIZE + 50);

    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));
    await runOneStep(t);
    expect((await forkedSource(t, forkId)).chunks).toHaveLength(FORK_CHUNK_BATCH_SIZE);
    await reprocessOriginal(t, docId, 30, "completed");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const { doc, chunks } = await forkedSource(t, forkId);
    expect(doc.status).toBe("completed");
    expect(doc.extractedMarkdown).toBe("# New text");
    expect(doc.totalChunks).toBe(30);
    expect(chunks.map((c) => c.content).sort()).toEqual(
      Array.from({ length: 30 }, (_, i) => `new chunk ${i}`).sort()
    );
  });

  test("follows a new file uploaded to the original mid-copy and drops the old one", async () => {
    const t = convexTest(schema, modules);
    const { notebookId, docId, forkerId } = await seedSource(t, FORK_CHUNK_BATCH_SIZE + 50);
    const oldFileId = await t.run(async (ctx) => {
      const fileId = await ctx.storage.store(new Blob(["%PDF old"]));
      await ctx.db.patch(docId, { storageId: fileId });
      return fileId;
    });

    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));
    await runOneStep(t);
    // The owner's upload swaps the original's file; the original lets go of the old one.
    const newFileId = await t.run(async (ctx) => {
      const fileId = await ctx.storage.store(new Blob(["%PDF new"]));
      await ctx.db.patch(docId, { storageId: fileId });
      return fileId;
    });
    await reprocessOriginal(t, docId, 10, "completed");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const { doc } = await forkedSource(t, forkId);
    expect(doc.storageId).toBe(newFileId);
    expect(await t.run((ctx) => ctx.db.system.get(oldFileId))).toBeNull();
  });

  test("waits while the original is reprocessing, then copies the new version", async () => {
    const t = convexTest(schema, modules);
    const { notebookId, docId, forkerId } = await seedSource(t, FORK_CHUNK_BATCH_SIZE + 50);

    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));
    await runOneStep(t);
    await reprocessOriginal(t, docId, 20, "processing");
    await runOneStep(t);
    expect((await forkedSource(t, forkId)).doc.status).toBe("processing");
    // Reprocessing finishes without touching `updatedAt` again.
    await t.run((ctx) => ctx.db.patch(docId, { status: "completed" }));
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const { doc, chunks } = await forkedSource(t, forkId);
    expect(doc.status).toBe("completed");
    expect(doc.extractedMarkdown).toBe("# New text");
    expect(chunks.map((c) => c.content).sort()).toEqual(
      Array.from({ length: 20 }, (_, i) => `new chunk ${i}`).sort()
    );
  });

  test("gives up, without leftover chunks, when the original never finishes reprocessing", async () => {
    const t = convexTest(schema, modules);
    const { notebookId, docId, forkerId } = await seedSource(t, FORK_CHUNK_BATCH_SIZE + 50);

    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));
    await runOneStep(t);
    await reprocessOriginal(t, docId, 20, "processing");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const { doc, chunks } = await forkedSource(t, forkId);
    expect(doc.status).toBe("failed");
    expect(doc.error).toEqual(expect.any(String));
    expect(chunks).toHaveLength(0);
  });

  test("refuses a notebook with too many sources with a readable error", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { notebookId, forkerId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { name: "Owner" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: ownerId,
        title: "Huge",
        createdAt: now,
        updatedAt: now,
      });
      for (let i = 0; i < 201; i++) {
        await ctx.db.insert("documents", {
          userId: ownerId,
          notebookId,
          fileName: `s${i}.txt`,
          fileType: "text",
          status: "completed",
          createdAt: now,
          updatedAt: now,
        });
      }
      const forkerId = await ctx.db.insert("users", { name: "Forker" });
      return { notebookId, forkerId };
    });

    const error = await t
      .run((ctx) => performNotebookFork(ctx, notebookId, forkerId))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{ type: string; detail: string }>).data).toMatchObject({
      type: "INPUT_VALIDATION_ERROR",
      detail: expect.stringContaining("200"),
    });
  });
});

describe("performNotebookFork practice items", () => {
  test("the forker starts without the owner's answers, grades or review history", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { notebookId, forkerId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { name: "Owner" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: ownerId,
        title: "Original",
        createdAt: now,
        updatedAt: now,
      });
      const base = {
        userId: ownerId,
        notebookId,
        status: "completed",
        createdAt: now,
        updatedAt: now,
      };
      await ctx.db.insert("flashcards", {
        ...base,
        title: "Deck",
        cardsData: [{ front: "Q", back: "A", proficiency: { interval: 30, easeFactor: 2.6 } }],
        metadata: { difficulty: "hard", showMastered: true, lastViewedIndex: 0 },
      });
      await ctx.db.insert("quizzes", {
        ...base,
        title: "Quiz",
        questionsData: [{ question: "Q", options: ["a", "b"], correctAnswer: 1 }],
        metadata: { difficulty: "easy", userAnswers: { 0: 1 }, lastViewedIndex: 0 },
      });
      await ctx.db.insert("writtenQuestions", {
        ...base,
        title: "Written",
        questionType: "short",
        questionsData: [{ id: "q1", question: "Why?" }],
        metadata: { focus: "causes", userAnswers: { q1: { answer: "x", score: 4 } } },
      });
      const forkerId = await ctx.db.insert("users", { name: "Forker" });
      return { notebookId, forkerId };
    });

    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));

    const forked = await t.run(async (ctx) => {
      const byNotebook = <T extends "flashcards" | "quizzes" | "writtenQuestions">(table: T) =>
        ctx.db
          .query(table)
          .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
          .unique();
      return {
        deck: await byNotebook("flashcards"),
        quiz: await byNotebook("quizzes"),
        written: await byNotebook("writtenQuestions"),
      };
    });
    expect(forked.deck?.cardsData).toEqual([{ front: "Q", back: "A" }]);
    expect(forked.deck?.metadata).toEqual({ difficulty: "hard" });
    expect(forked.quiz?.questionsData).toHaveLength(1);
    expect(forked.quiz?.metadata).toEqual({ difficulty: "easy" });
    expect(forked.written?.metadata).toEqual({ focus: "causes" });
  });
});

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
    // An unfinished item has no job in the fork to finish it.
    expect(forkedInfographics.map((i) => i.title)).toEqual(["Chart"]);
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
        // A finished row can still carry the synthesis record of the job that made it.
        status: "completed",
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

describe("performNotebookFork unfinished studio items", () => {
  test("leaves generating and failed items behind", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const notebookId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { name: "Owner" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: ownerId,
        title: "Original",
        createdAt: now,
        updatedAt: now,
      });
      for (const status of ["completed", "generating", "failed"]) {
        await ctx.db.insert("reports", {
          userId: ownerId,
          notebookId,
          title: status,
          content: "",
          reportType: "summary",
          status,
          createdAt: now,
          updatedAt: now,
        });
      }
      return notebookId;
    });

    const forkerId = await t.run((ctx) => ctx.db.insert("users", { name: "Forker" }));
    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));

    const forked = await t.run((ctx) =>
      ctx.db
        .query("reports")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect()
    );
    expect(forked.map((r) => r.title)).toEqual(["completed"]);
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

  test("skips failed and chat-session tables and reports", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const notebookId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { name: "Owner" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: ownerId,
        title: "Review",
        createdAt: now,
        updatedAt: now,
      });
      const sessionId = await ctx.db.insert("literatureReviewSessions", {
        query: "q",
        notebookId,
        userId: ownerId,
        workflowId: "wf",
        status: "completed",
        createdAt: now,
        updatedAt: now,
      } as never);
      for (const [title, extra] of [
        ["Failed", { status: "failed" as const }],
        ["From chat", { status: "completed" as const, literatureReviewSessionId: sessionId }],
      ] as const) {
        await ctx.db.insert("literatureTables", {
          title,
          notebookId,
          userId: ownerId,
          columns: [],
          papers: [],
          createdAt: now,
          updatedAt: now,
          ...extra,
        });
        await ctx.db.insert("literatureReports", {
          title,
          notebookId,
          userId: ownerId,
          content: "",
          citationStyle: "apa7",
          sections: [],
          citationIds: [],
          createdAt: now,
          updatedAt: now,
          ...extra,
        });
      }
      return notebookId;
    });

    const forkerId = await t.run((ctx) => ctx.db.insert("users", { name: "Forker" }));
    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));

    const counts = await t.run(async (ctx) => ({
      tables: (
        await ctx.db
          .query("literatureTables")
          .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
          .collect()
      ).length,
      reports: (
        await ctx.db
          .query("literatureReports")
          .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
          .collect()
      ).length,
    }));
    expect(counts).toEqual({ tables: 0, reports: 0 });
  });

  test("skips older chat outputs linked only from a session or named like one", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const notebookId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { name: "Owner" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: ownerId,
        title: "Review",
        createdAt: now,
        updatedAt: now,
      });
      const table = (title: string) =>
        ctx.db.insert("literatureTables", {
          title,
          notebookId,
          userId: ownerId,
          status: "completed",
          columns: [],
          papers: [],
          createdAt: now,
          updatedAt: now,
        });
      const report = (title: string) =>
        ctx.db.insert("literatureReports", {
          title,
          notebookId,
          userId: ownerId,
          status: "completed",
          content: "",
          citationStyle: "apa7",
          sections: [],
          citationIds: [],
          createdAt: now,
          updatedAt: now,
        });
      const linkedTableId = await table("Linked table");
      const linkedReportId = await report("Linked report");
      await table("Literature table — sleep");
      await report("Report — sleep");
      await table("Studio table");
      await ctx.db.insert("literatureReviewSessions", {
        query: "q",
        notebookId,
        userId: ownerId,
        workflowId: "wf",
        status: "completed",
        tableId: linkedTableId,
        reportId: linkedReportId,
        createdAt: now,
        updatedAt: now,
      } as never);
      return notebookId;
    });

    const forkerId = await t.run((ctx) => ctx.db.insert("users", { name: "Forker" }));
    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));

    const titles = await t.run(async (ctx) => ({
      tables: (
        await ctx.db
          .query("literatureTables")
          .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
          .collect()
      ).map((r) => r.title),
      reports: (
        await ctx.db
          .query("literatureReports")
          .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
          .collect()
      ).map((r) => r.title),
    }));
    expect(titles).toEqual({ tables: ["Studio table"], reports: [] });
  });

  test("notebook-paper citations point at the fork's own sources", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const seeded = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { name: "Owner" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: ownerId,
        title: "Review",
        createdAt: now,
        updatedAt: now,
      });
      const source = (fileName: string, status: "completed" | "failed") =>
        ctx.db.insert("documents", {
          userId: ownerId,
          notebookId,
          fileName,
          fileType: "pdf",
          status,
          createdAt: now,
          updatedAt: now,
        });
      const docId = await source("paper.pdf", "completed");
      // Failed sources aren't forked, so a citation of one has no copy to point at.
      const failedDocId = await source("broken.pdf", "failed");
      const notebookCitation = (documentId: typeof docId, key: string) =>
        ctx.db.insert("citations", {
          paperId: `notebook:${documentId}`,
          title: key,
          authors: ["B"],
          url: "https://example.org/n",
          sourceApi: "notebook",
          citationKey: key,
          documentId,
        });
      const externalId = await ctx.db.insert("citations", {
        paperId: "W1",
        title: "Paper",
        authors: ["A"],
        url: "https://example.org/p",
        sourceApi: "openalex",
        citationKey: "a2020",
      });
      const notebookCitationId = await notebookCitation(docId, "b2021");
      const orphanCitationId = await notebookCitation(failedDocId, "c2022");
      const citationIds = [externalId, notebookCitationId, orphanCitationId];
      await ctx.db.insert("literatureTables", {
        title: "Table",
        notebookId,
        userId: ownerId,
        status: "completed",
        columns: [],
        papers: citationIds.map((citationId) => ({ citationId, rowData: {}, isIncluded: true })),
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
        citationIds,
        createdAt: now,
        updatedAt: now,
      });
      return { notebookId, externalId, notebookCitationId, orphanCitationId };
    });

    const forkerId = await t.run((ctx) => ctx.db.insert("users", { name: "Forker" }));
    const forkId = await t.run((ctx) => performNotebookFork(ctx, seeded.notebookId, forkerId));

    const result = await t.run(async (ctx) => {
      const [table] = await ctx.db
        .query("literatureTables")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect();
      const [report] = await ctx.db
        .query("literatureReports")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect();
      const [forkDoc] = await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect();
      const tableCitationIds = table.papers.map((p) => p.citationId);
      const citations = await Promise.all(tableCitationIds.map((id) => ctx.db.get(id)));
      return { tableCitationIds, reportCitationIds: report.citationIds, citations, forkDoc };
    });

    const [external, notebookCopy, orphanCopy] = result.citations;
    expect(result.tableCitationIds[0]).toBe(seeded.externalId);
    expect(result.tableCitationIds[1]).not.toBe(seeded.notebookCitationId);
    expect(notebookCopy).toMatchObject({ citationKey: "b2021", documentId: result.forkDoc._id });
    expect(result.tableCitationIds[2]).not.toBe(seeded.orphanCitationId);
    expect(orphanCopy?.citationKey).toBe("c2022");
    expect(orphanCopy?.documentId).toBeUndefined();
    expect(external?.sourceApi).toBe("openalex");
    expect(result.reportCitationIds).toEqual(result.tableCitationIds);
  });
});

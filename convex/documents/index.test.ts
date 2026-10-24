/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { MAX_DOCUMENTS_PER_NOTEBOOK_LIST } from "../_lib/queryCaps";
import { TEXT_TITLE_MAX_LENGTH } from "../_lib/textTitle";
import { preloadModules } from "../_testing/preloadModules.helpers";
import { performNotebookFork } from "../notebooks/_forkNotebook";
import schema from "../schema";
import { CHUNK_DELETE_BATCH_SIZE, deleteAllChunksForDocument } from "./internal";
import { MAX_STORED_MARKDOWN_CHARS } from "./storedMarkdown.helpers";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./documents/index.ts"]);

const MOCK_SOURCE_GUIDE = {
  summary: "A paper about neural networks.",
  topics: ["AI", "ML", "NLP"],
};

// Helper to create modules with mocked rate limits + deterministic source guide LLM
async function createModulesWithMockedLimits() {
  const actualLimits = (await modules["./_lib/limits.ts"]()) as Record<string, unknown>;
  const { action, internalMutation } = await import("../_generated/server");
  const { v } = await import("convex/values");
  const { internal } = await import("../_generated/api");
  const { getAuthUserId } = await import("../auth");

  return {
    ...modules,
    "./_lib/limits.ts": async () => ({
      ...actualLimits,
      checkDailyLimitInternal: internalMutation({
        args: { userId: v.string(), feature: v.string() },
        handler: async () => {},
      }),
      consumeDailyLimitInternal: internalMutation({
        args: { userId: v.string(), feature: v.string() },
        handler: async () => {},
      }),
    }),
    "./documents/sourceGuide.ts": async () => ({
      generateSourceGuide: action({
        args: { documentId: v.id("documents") },
        handler: async (ctx, args) => {
          const userId = await getAuthUserId(ctx);
          if (!userId) {
            throw new Error("Unauthorized");
          }

          const document = await ctx.runQuery(internal.documents.index.getDocumentInternal, {
            documentId: args.documentId,
            userId,
          });

          if (!document) {
            throw new Error("Document not found");
          }

          if (document.status !== "completed") {
            throw new Error("Document content not yet extracted");
          }

          if (document.sourceGuide) {
            return document.sourceGuide;
          }

          const guide = {
            ...MOCK_SOURCE_GUIDE,
            generatedAt: Date.now(),
          };

          await ctx.runMutation(internal.documents.index.setSourceGuide, {
            documentId: args.documentId,
            summary: guide.summary,
            topics: guide.topics,
          });

          try {
            await ctx.runMutation(internal._lib.limits.consumeDailyLimitInternal, {
              userId,
              feature: "sourceGuide",
            });
          } catch {
            // non-fatal, matches production handler
          }

          return guide;
        },
      }),
    }),
  };
}

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

async function seedUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}

async function seedNotebook(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">
): Promise<Id<"notebooks">> {
  return t.run(async (ctx) =>
    ctx.db.insert("notebooks", {
      userId,
      title: "Test Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function seedDocuments(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  notebookId: Id<"notebooks">,
  count: number
): Promise<void> {
  await t.run(async (ctx) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: `Existing ${i}`,
        fileType: "url",
        fileUrl: `https://existing.example.com/${i}`,
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  });
}

async function countNotebookDocuments(
  t: ReturnType<typeof convexTest>,
  notebookId: Id<"notebooks">
): Promise<number> {
  return t.run(
    async (ctx) =>
      (
        await ctx.db
          .query("documents")
          .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
          .collect()
      ).length
  );
}

describe("documents.upload", () => {
  test("creates a paper_record document with correct status", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const result = await asUser.mutation(api.documents.index.upload, {
      notebookId,
      type: "paper_record",
      fileName: "Attention Is All You Need",
      paperRecord: {
        abstract: "We propose a new network architecture...",
        authors: ["Vaswani, A.", "Shazeer, N."],
        doi: "10.1234/attention",
        isOa: true,
        pdfUrl: "https://arxiv.org/pdf/1706.03762.pdf",
      },
    });

    expect(result.status).toBe("pending");
    expect(result.documentId).toBeDefined();

    const doc = await t.run(async (ctx) => ctx.db.get(result.documentId as Id<"documents">));
    expect(doc?.fileType).toBe("paper_record");
    expect(doc?.fulltextStatus).toBe("available");
    expect(doc?.ingestionStatus).toBe("pending");
    expect(doc?.fileName).toBe("Attention Is All You Need");
  });

  test("rejects paper_record without paperRecord field", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    await expect(
      asUser.mutation(api.documents.index.upload, {
        notebookId,
        type: "paper_record",
        fileName: "No Record Paper",
      })
    ).rejects.toThrow("paperRecord is required for paper_record type");
  });

  test("rejects invalid type", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    await expect(
      asUser.mutation(api.documents.index.upload, {
        notebookId,
        type: "invalid_type",
        fileName: "Bad Type",
      } as Parameters<typeof api.documents.index.upload>[0])
    ).rejects.toThrow("Invalid type");
  });

  test("rejects pasted text whose title is longer than the limit", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    await expect(
      asUser.mutation(api.documents.index.upload, {
        notebookId,
        type: "text",
        source: "Some notes",
        fileName: "t".repeat(TEXT_TITLE_MAX_LENGTH + 1),
      })
    ).rejects.toThrow(`Title must be ${TEXT_TITLE_MAX_LENGTH} characters or fewer`);
  });

  test("accepts pasted text with a title at the limit", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const result = await asUser.mutation(api.documents.index.upload, {
      notebookId,
      type: "text",
      source: "Some notes",
      fileName: "t".repeat(TEXT_TITLE_MAX_LENGTH),
    });
    expect(result.documentId).toBeDefined();
  });

  test("rejects file upload without storageId", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    await expect(
      asUser.mutation(api.documents.index.upload, {
        notebookId,
        type: "file",
        fileName: "test.pdf",
      })
    ).rejects.toThrow("storageId is required for file uploads");
  });

  test("rejects url type without source", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    await expect(
      asUser.mutation(api.documents.index.upload, {
        notebookId,
        type: "url",
        fileName: "Example URL",
      })
    ).rejects.toThrow("source is required for url/youtube/text type");
  });

  test("creates a url document", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const result = await asUser.mutation(api.documents.index.upload, {
      notebookId,
      type: "url",
      source: "https://example.com",
      fileName: "Example Page",
    });

    expect(result.status).toBe("pending");
    const doc = await t.run(async (ctx) => ctx.db.get(result.documentId as Id<"documents">));
    expect(doc?.fileType).toBe("url");
    expect(doc?.fileUrl).toBe("https://example.com");
  });
});

describe("documents.get", () => {
  test("returns a document by ID for authorized user", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const uploaded = await asUser.mutation(api.documents.index.upload, {
      notebookId,
      type: "paper_record",
      fileName: "Test Paper",
      paperRecord: { abstract: "Abstract", authors: ["Author"], isOa: false },
    });

    const doc = await asUser.query(api.documents.index.get, {
      id: uploaded.documentId as Id<"documents">,
    });

    expect(doc).not.toBeNull();
    expect(doc?.fileName).toBe("Test Paper");
  });

  test("returns null for unauthorized user", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherUserId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    const asOwner = withAuth(t, ownerId);
    const asOther = withAuth(t, otherUserId);

    const uploaded = await asOwner.mutation(api.documents.index.upload, {
      notebookId,
      type: "paper_record",
      fileName: "Private Paper",
      paperRecord: { abstract: "Abstract", authors: ["Author"], isOa: false },
    });

    const doc = await asOther.query(api.documents.index.get, {
      id: uploaded.documentId as Id<"documents">,
    });

    expect(doc).toBeNull();
  });
});

describe("documents.list", () => {
  test("returns documents scoped to a notebook", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    await asUser.mutation(api.documents.index.upload, {
      notebookId,
      type: "paper_record",
      fileName: "Paper A",
      paperRecord: { abstract: "A", authors: ["A"], isOa: false },
    });

    await asUser.mutation(api.documents.index.upload, {
      notebookId,
      type: "paper_record",
      fileName: "Paper B",
      paperRecord: { abstract: "B", authors: ["B"], isOa: false },
    });

    const docs = await asUser.query(api.documents.index.list, { notebookId });
    expect(docs).toHaveLength(2);
  });

  test("returns empty array for notebook with no documents", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const docs = await asUser.query(api.documents.index.list, { notebookId });
    expect(docs).toEqual([]);
  });

  test("returns empty array when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    const notebookId = await seedNotebook(t, await seedUser(t));

    const docs = await t.query(api.documents.index.list, { notebookId });
    expect(docs).toEqual([]);
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

    const docs = await withAuth(t, userId).query(api.documents.index.list, { notebookId });
    expect(docs).toHaveLength(MAX_DOCUMENTS_PER_NOTEBOOK_LIST);
    expect(docs[0].fileName).toBe(`doc-${total - 1}`);
  });
});

describe("documents.getContent", () => {
  test("returns null for document with no chunks and no extracted markdown", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const uploaded = await asUser.mutation(api.documents.index.upload, {
      notebookId,
      type: "paper_record",
      fileName: "Pending Paper",
      paperRecord: { abstract: "Abstract", authors: ["Author"], isOa: false },
    });

    const content = await asUser.query(api.documents.index.getContent, {
      id: uploaded.documentId as Id<"documents">,
    });

    expect(content).toBeNull();
  });

  test("returns extracted markdown when available", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const docId = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Test Doc",
        fileType: "text",
        fileUrl: "Some text content",
        status: "completed",
        extractedMarkdown: "# Markdown Content\n\nThis is the text.",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const content = await asUser.query(api.documents.index.getContent, {
      id: docId,
    });

    expect(content).not.toBeNull();
    expect(content?.content).toBe("# Markdown Content\n\nThis is the text.");
    expect(content?.chunkCount).toBe(0);
  });

  test("counts chunks from totalChunks, not chunk rows, when markdown is stored", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const docId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Ingesting Doc",
        fileType: "file",
        status: "processing",
        extractedMarkdown: "Full text.",
        totalChunks: 5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      // Ingestion is partway through: one of five chunks inserted.
      await ctx.db.insert("documentChunks", {
        documentId: id,
        userId,
        notebookId,
        content: "Chunk text that the viewer must not show.",
        chunkIndex: 0,
        createdAt: Date.now(),
      });
      return id;
    });

    const content = await asUser.query(api.documents.index.getContent, { id: docId });

    expect(content?.content).toBe("Full text.");
    expect(content?.chunkCount).toBe(5);
  });

  test("legacy fallback stops reading chunks at the stored-markdown cap", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);
    const half = Math.ceil(MAX_STORED_MARKDOWN_CHARS / 2);

    const docId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Huge Legacy Doc",
        fileType: "file",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      for (const [chunkIndex, letter] of ["a", "b", "c"].entries()) {
        await ctx.db.insert("documentChunks", {
          documentId: id,
          userId,
          notebookId,
          content: letter.repeat(half),
          chunkIndex,
          createdAt: Date.now(),
        });
      }
      return id;
    });

    const content = await asUser.query(api.documents.index.getContent, { id: docId });

    expect(content?.content).toContain("a");
    expect(content?.content).toContain("b");
    expect(content?.content).not.toContain("c");
    expect(content?.chunkCount).toBe(2);
  });

  test("stitches chunks as legacy fallback", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const docId = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Chunked Doc",
        fileType: "file",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("documentChunks", {
        documentId: docId,
        userId,
        notebookId,
        content: "First chunk content.",
        chunkIndex: 0,
        createdAt: Date.now(),
      });
      await ctx.db.insert("documentChunks", {
        documentId: docId,
        userId,
        notebookId,
        content: "Second chunk content.",
        chunkIndex: 1,
        createdAt: Date.now(),
      });
    });

    const content = await asUser.query(api.documents.index.getContent, {
      id: docId,
    });

    expect(content).not.toBeNull();
    expect(content?.content).toContain("First chunk content.");
    expect(content?.content).toContain("Second chunk content.");
    expect(content?.chunkCount).toBe(2);
  });
});

describe("documents.update", () => {
  test("renames a document", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const uploaded = await asUser.mutation(api.documents.index.upload, {
      notebookId,
      type: "paper_record",
      fileName: "Old Title",
      paperRecord: { abstract: "Abstract", authors: ["Author"], isOa: false },
    });

    const updated = await asUser.mutation(api.documents.index.update, {
      id: uploaded.documentId as Id<"documents">,
      title: "New Title",
    });

    expect(updated?.fileName).toBe("New Title");
  });

  test("preserves file extension when renaming", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const docId = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "report.pdf",
        fileType: "file",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const updated = await asUser.mutation(api.documents.index.update, {
      id: docId,
      title: "Annual Report",
    });

    expect(updated?.fileName).toBe("Annual Report.pdf");
  });

  test("rejects update for document in unauthorized notebook", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherUserId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);
    const asOther = withAuth(t, otherUserId);

    const docId = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        userId: ownerId,
        notebookId,
        fileName: "Protected Doc",
        fileType: "text",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    await expect(
      asOther.mutation(api.documents.index.update, {
        id: docId,
        title: "Hacked Title",
      })
    ).rejects.toThrow();
  });
});

describe("documents.remove", () => {
  test("deletes a document and its chunks", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const docId = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "To Delete",
        fileType: "text",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("documentChunks", {
        documentId: docId,
        userId,
        notebookId,
        content: "Chunk to delete",
        chunkIndex: 0,
        createdAt: Date.now(),
      });
    });

    await asUser.mutation(api.documents.index.remove, { id: docId });

    const doc = await t.run(async (ctx) => ctx.db.get(docId));
    expect(doc).toBeNull();

    const chunks = await t.run(async (ctx) =>
      ctx.db
        .query("documentChunks")
        .withIndex("by_document", (q) => q.eq("documentId", docId))
        .collect()
    );
    expect(chunks).toHaveLength(0);
  });
});

describe("documents.remove: large sources", () => {
  async function seedDocWithChunks(t: ReturnType<typeof convexTest>, count: number) {
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const docId = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Big source",
        fileType: "text",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    await t.run(async (ctx) => {
      for (let i = 0; i < count; i++) {
        await ctx.db.insert("documentChunks", {
          documentId: docId,
          userId,
          notebookId,
          content: `Chunk ${i}`,
          chunkIndex: i,
          createdAt: Date.now(),
        });
      }
    });
    return { userId, notebookId, docId };
  }

  function chunksOf(t: ReturnType<typeof convexTest>, docId: Id<"documents">) {
    return t.run(async (ctx) =>
      ctx.db
        .query("documentChunks")
        .withIndex("by_document", (q) => q.eq("documentId", docId))
        .collect()
    );
  }

  test("deletes the document at once and drains its chunks in batches", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const count = CHUNK_DELETE_BATCH_SIZE * 2 + 50;
      const { userId, docId } = await seedDocWithChunks(t, count);

      await withAuth(t, userId).mutation(api.documents.index.remove, { id: docId });

      expect(await t.run(async (ctx) => ctx.db.get(docId))).toBeNull();
      expect(await chunksOf(t, docId)).toHaveLength(count - CHUNK_DELETE_BATCH_SIZE);

      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await chunksOf(t, docId)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("leaves chunks stored after the delete started (re-embed)", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const { userId, notebookId, docId } = await seedDocWithChunks(
        t,
        CHUNK_DELETE_BATCH_SIZE + 20
      );

      await t.run(async (ctx) => deleteAllChunksForDocument(ctx, docId));
      vi.advanceTimersByTime(5);
      const fresh = await t.run(async (ctx) =>
        ctx.db.insert("documentChunks", {
          documentId: docId,
          userId,
          notebookId,
          content: "Re-embedded chunk",
          chunkIndex: 0,
          createdAt: Date.now(),
        })
      );
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect((await chunksOf(t, docId)).map((c) => c._id)).toEqual([fresh]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("retrieval skips chunks whose document is gone", async () => {
    const t = convexTest(schema, modules);
    const { docId } = await seedDocWithChunks(t, 2);
    const [first, second] = (await chunksOf(t, docId)).map((c) => c._id);

    expect(
      (await t.query(internal.documents.chunks.getChunks, { chunkIds: [first, second] })).map(
        (c) => c?._id
      )
    ).toEqual([first, second]);

    await t.run(async (ctx) => ctx.db.delete(docId));
    expect(
      await t.query(internal.documents.chunks.getChunks, { chunkIds: [first, second] })
    ).toEqual([null, null]);
  });
});

describe("documents.removeMany", () => {
  test("batch deletes multiple documents", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const docId1 = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Doc 1",
        fileType: "text",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const docId2 = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Doc 2",
        fileType: "text",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const result = await asUser.mutation(api.documents.index.removeMany, {
      ids: [docId1, docId2],
    });

    expect(result.deleted).toBe(2);

    const docs = await t.run(async (ctx) =>
      ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .collect()
    );
    expect(docs).toHaveLength(0);
  });

  test("returns zero deleted for empty array", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const result = await asUser.mutation(api.documents.index.removeMany, {
      ids: [],
    });

    expect(result.deleted).toBe(0);
  });
});

describe("deleting a source whose file a fork shares", () => {
  /** Owner's notebook with one stored source, forked into another user's account. */
  async function seedForkedSource(t: ReturnType<typeof convexTest>) {
    const owner = await seedUser(t);
    const forker = await seedUser(t);
    const notebookId = await seedNotebook(t, owner);
    const { fileId, docId } = await t.run(async (ctx) => {
      const fileId = await ctx.storage.store(new Blob(["%PDF-1.7"]));
      const docId = await ctx.db.insert("documents", {
        userId: owner,
        notebookId,
        fileName: "paper.pdf",
        fileType: "pdf",
        storageId: fileId,
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { fileId, docId };
    });
    const forkNotebookId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forker));
    const forkDocId = await t.run(async (ctx) => {
      const [forkDoc] = await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkNotebookId))
        .collect();
      return forkDoc._id;
    });
    return { owner, forker, fileId, docId, forkDocId };
  }

  test("deleting the fork's copy keeps the owner's file", async () => {
    const t = convexTest(schema, modules);
    const { forker, fileId, forkDocId } = await seedForkedSource(t);

    await withAuth(t, forker).mutation(api.documents.index.remove, { id: forkDocId });

    expect(await t.run((ctx) => ctx.db.system.get(fileId))).not.toBeNull();
  });

  test("deleting the original keeps the file while a fork still uses it", async () => {
    const t = convexTest(schema, modules);
    const { owner, fileId, docId } = await seedForkedSource(t);

    await withAuth(t, owner).mutation(api.documents.index.removeMany, { ids: [docId] });

    expect(await t.run((ctx) => ctx.db.system.get(fileId))).not.toBeNull();
  });

  test("deleting the last document that uses the file deletes it", async () => {
    const t = convexTest(schema, modules);
    const { owner, forker, fileId, docId, forkDocId } = await seedForkedSource(t);

    await withAuth(t, forker).mutation(api.documents.index.removeMany, { ids: [forkDocId] });
    expect(await t.run((ctx) => ctx.db.system.get(fileId))).not.toBeNull();
    await withAuth(t, owner).mutation(api.documents.index.remove, { id: docId });

    expect(await t.run((ctx) => ctx.db.system.get(fileId))).toBeNull();
  });
});

describe("documents.getSignedUrl for a file a fork shares", () => {
  async function seedPublicSourceForkedAway(t: ReturnType<typeof convexTest>) {
    const owner = await seedUser(t);
    const forker = await seedUser(t);
    const stranger = await seedUser(t);
    const notebookId = await seedNotebook(t, owner);
    const fileId = await t.run(async (ctx) => {
      await ctx.db.patch(notebookId, { isPublic: true });
      const fileId = await ctx.storage.store(new Blob(["%PDF-1.7"]));
      await ctx.db.insert("documents", {
        userId: owner,
        notebookId,
        fileName: "paper.pdf",
        fileType: "pdf",
        storageId: fileId,
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return fileId;
    });
    await t.run((ctx) => performNotebookFork(ctx, notebookId, forker));
    // The owner takes the notebook off the Public tab; the forker keeps their copy.
    await t.run((ctx) => ctx.db.patch(notebookId, { isPublic: false }));
    const forkDocId = await t.run(async (ctx) => {
      const [doc] = await ctx.db
        .query("documents")
        .withIndex("by_user", (q) => q.eq("userId", forker))
        .collect();
      return doc._id;
    });
    return { owner, forker, stranger, fileId, forkDocId };
  }

  test("the forker still gets a URL after the original is unpublished", async () => {
    const t = convexTest(schema, modules);
    const { forker, fileId, forkDocId } = await seedPublicSourceForkedAway(t);

    const url = await withAuth(t, forker).mutation(api.documents.index.getSignedUrl, {
      storageId: fileId,
      documentId: forkDocId,
    });

    expect(url).toEqual(expect.any(String));
  });

  test("a user who can read neither notebook is refused", async () => {
    const t = convexTest(schema, modules);
    const { stranger, fileId, forkDocId } = await seedPublicSourceForkedAway(t);

    await expect(
      withAuth(t, stranger).mutation(api.documents.index.getSignedUrl, {
        storageId: fileId,
        documentId: forkDocId,
      })
    ).rejects.toThrow("Notebook not found");
  });

  /** A public notebook forked `forkCount` times, then unpublished. */
  async function seedManyForks(t: ReturnType<typeof convexTest>, forkCount: number) {
    const owner = await seedUser(t);
    const notebookId = await seedNotebook(t, owner);
    const { fileId, otherFileId } = await t.run(async (ctx) => {
      await ctx.db.patch(notebookId, { isPublic: true });
      const fileId = await ctx.storage.store(new Blob(["%PDF-1.7"]));
      const otherFileId = await ctx.storage.store(new Blob(["%PDF-1.7 other"]));
      await ctx.db.insert("documents", {
        userId: owner,
        notebookId,
        fileName: "paper.pdf",
        fileType: "pdf",
        storageId: fileId,
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { fileId, otherFileId };
    });
    let lastForker = owner;
    for (let i = 0; i < forkCount; i++) {
      lastForker = await seedUser(t);
      const forker = lastForker;
      await t.run((ctx) => performNotebookFork(ctx, notebookId, forker));
    }
    await t.run((ctx) => ctx.db.patch(notebookId, { isPublic: false }));
    const forkDocId = await t.run(async (ctx) => {
      const [doc] = await ctx.db
        .query("documents")
        .withIndex("by_user", (q) => q.eq("userId", lastForker))
        .collect();
      return doc._id;
    });
    return { lastForker, forkDocId, fileId, otherFileId };
  }

  test("a later forker gets the URL through their own source", async () => {
    const t = convexTest(schema, modules);
    const { lastForker, forkDocId, fileId } = await seedManyForks(t, 21);

    const url = await withAuth(t, lastForker).mutation(api.documents.index.getSignedUrl, {
      storageId: fileId,
      documentId: forkDocId,
    });

    expect(url).toEqual(expect.any(String));
  });

  test("a source that doesn't hold the file is refused", async () => {
    const t = convexTest(schema, modules);
    const { lastForker, forkDocId, otherFileId } = await seedManyForks(t, 1);

    await expect(
      withAuth(t, lastForker).mutation(api.documents.index.getSignedUrl, {
        storageId: otherFileId,
        documentId: forkDocId,
      })
    ).rejects.toThrow("Document not found");
  });

  test("a source in a notebook the caller can't read is refused", async () => {
    const t = convexTest(schema, modules);
    const { forkDocId, fileId } = await seedManyForks(t, 1);
    const stranger = await seedUser(t);

    await expect(
      withAuth(t, stranger).mutation(api.documents.index.getSignedUrl, {
        storageId: fileId,
        documentId: forkDocId,
      })
    ).rejects.toThrow("Notebook not found");
  });
});

describe("documents.addExternalSources", () => {
  test("creates documents from discovered sources", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const ids = await asUser.mutation(api.documents.index.addExternalSources, {
      notebookId,
      sources: [
        {
          title: "Web Article",
          url: "https://example.com/article",
          snippet: "A web article.",
          sourceType: "web",
        },
        {
          title: "Academic Paper",
          url: "https://arxiv.org/abs/1234",
          snippet: "An academic paper.",
          sourceType: "academic",
        },
      ],
    });

    expect(ids).toHaveLength(2);

    const docs = await t.run(async (ctx) =>
      ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .collect()
    );

    expect(docs).toHaveLength(2);
    const academicDoc = docs.find((d) => d.fileType === "paper_record");
    expect(academicDoc?.fileName).toBe("Academic Paper");
  });

  test("deduplicates by URL", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    await asUser.mutation(api.documents.index.addExternalSources, {
      notebookId,
      sources: [
        {
          title: "First Article",
          url: "https://example.com/dup",
          snippet: "First.",
          sourceType: "web",
        },
      ],
    });

    const ids = await asUser.mutation(api.documents.index.addExternalSources, {
      notebookId,
      sources: [
        {
          title: "Duplicate Article",
          url: "https://example.com/dup",
          snippet: "Duplicate.",
          sourceType: "web",
        },
      ],
    });

    expect(ids).toHaveLength(0);

    const docs = await t.run(async (ctx) =>
      ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .collect()
    );
    expect(docs).toHaveLength(1);
  });

  test("enforces the source limit across the batch", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    await seedDocuments(t, userId, notebookId, 19); // one below the free cap of 20
    const asUser = withAuth(t, userId);

    await expect(
      asUser.mutation(api.documents.index.addExternalSources, {
        notebookId,
        sources: [1, 2, 3].map((n) => ({
          title: `Source ${n}`,
          url: `https://example.com/${n}`,
          sourceType: "web",
        })),
      })
    ).rejects.toThrow("Source limit reached");

    // The mutation rolls back, so nothing from the batch is kept.
    expect(await countNotebookDocuments(t, notebookId)).toBe(19);
  });

  test("adds a batch that exactly fills the source limit, counting in-batch duplicates once", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    await seedDocuments(t, userId, notebookId, 18);
    const asUser = withAuth(t, userId);

    const ids = await asUser.mutation(api.documents.index.addExternalSources, {
      notebookId,
      sources: [
        { title: "A", url: "https://example.com/a", sourceType: "web" },
        { title: "A again", url: "https://example.com/a", sourceType: "web" },
        { title: "B", url: "https://example.com/b", sourceType: "web" },
      ],
    });

    expect(ids).toHaveLength(2);
    expect(await countNotebookDocuments(t, notebookId)).toBe(20);
  });

  test("refuses a notebook already at the source limit", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    await seedDocuments(t, userId, notebookId, 20);
    const asUser = withAuth(t, userId);

    await expect(
      asUser.mutation(api.documents.index.addExternalSources, {
        notebookId,
        sources: [{ title: "One more", url: "https://example.com/more", sourceType: "web" }],
      })
    ).rejects.toThrow("Source limit reached");
    expect(await countNotebookDocuments(t, notebookId)).toBe(20);
  });
});

describe("documents.assertCanAddSourceInternal", () => {
  test("applies the source limit to the given user without a signed-in identity", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    await seedDocuments(t, userId, notebookId, 19);

    expect(
      await t.query(internal.documents.index.assertCanAddSourceInternal, { notebookId, userId })
    ).toBeNull();

    await seedDocuments(t, userId, notebookId, 1);
    await expect(
      t.query(internal.documents.index.assertCanAddSourceInternal, { notebookId, userId })
    ).rejects.toThrow("Source limit reached");
  });
});

describe("documents source-guide access for shared notebooks", () => {
  async function seedSharedDocument(t: ReturnType<typeof convexTest>) {
    const owner = await seedUser(t);
    const member = await seedUser(t);
    const stranger = await seedUser(t);
    const notebookId = await seedNotebook(t, owner);
    const documentId = await t.run(async (ctx) => {
      await ctx.db.insert("notebookMembers", {
        notebookId,
        userId: member,
        role: "editor",
        joinedAt: Date.now(),
      });
      const id = await ctx.db.insert("documents", {
        userId: owner,
        notebookId,
        fileName: "Shared Paper",
        fileType: "file",
        status: "completed",
        sourceGuide: { summary: "Shared summary.", topics: ["Topic"], generatedAt: Date.now() },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("documentChunks", {
        documentId: id,
        userId: owner,
        notebookId,
        content: "Chunk uploaded by the owner.",
        chunkIndex: 0,
        createdAt: Date.now(),
      });
      return id;
    });
    return { owner, member, stranger, documentId };
  }

  test("getDocumentInternal returns the document to notebook members", async () => {
    const t = convexTest(schema, modules);
    const { owner, member, stranger, documentId } = await seedSharedDocument(t);

    for (const userId of [owner, member]) {
      const doc = await t.query(internal.documents.index.getDocumentInternal, {
        documentId,
        userId,
      });
      expect(doc?._id).toBe(documentId);
    }
    expect(
      await t.query(internal.documents.index.getDocumentInternal, {
        documentId,
        userId: stranger,
      })
    ).toBeNull();
  });

  test("getDocumentChunksInternal returns the uploader's chunks to notebook members", async () => {
    const t = convexTest(schema, modules);
    const { member, stranger, documentId } = await seedSharedDocument(t);

    const chunks = await t.query(internal.documents.index.getDocumentChunksInternal, {
      documentId,
      userId: member,
    });
    expect(chunks.map((c) => c.content)).toEqual(["Chunk uploaded by the owner."]);

    expect(
      await t.query(internal.documents.index.getDocumentChunksInternal, {
        documentId,
        userId: stranger,
      })
    ).toEqual([]);
  });
});

describe("documents.generateSourceGuide", () => {
  test("generates and stores source guide", async () => {
    const t = convexTest(schema, await createModulesWithMockedLimits());
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const docId = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Test Paper",
        fileType: "paper_record",
        status: "completed",
        extractedMarkdown:
          "This is a comprehensive paper about neural networks and transformers in machine learning. It covers attention mechanisms, deep learning architectures, and natural language processing applications in detail.",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const guide = await asUser.action(api.documents.sourceGuide.generateSourceGuide, {
      documentId: docId,
    });

    expect(guide).not.toBeNull();
    expect(guide?.summary).toBe("A paper about neural networks.");
    expect(guide?.topics).toEqual(["AI", "ML", "NLP"]);

    // Verify stored in DB
    const doc = await t.run(async (ctx) => ctx.db.get(docId));
    expect(doc?.sourceGuide?.summary).toBe("A paper about neural networks.");
    expect(doc?.sourceGuide?.topics).toEqual(["AI", "ML", "NLP"]);
  }, 30000);

  test("returns existing source guide if already generated", async () => {
    const t = convexTest(schema, await createModulesWithMockedLimits());
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const existingGuide = {
      summary: "Already generated.",
      topics: ["Topic"],
      generatedAt: Date.now(),
    };

    const docId = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Test Paper",
        fileType: "paper_record",
        status: "completed",
        extractedMarkdown: "Some content.",
        sourceGuide: existingGuide,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const guide = await asUser.action(api.documents.sourceGuide.generateSourceGuide, {
      documentId: docId,
    });

    expect(guide).toEqual(existingGuide);
  });

  test("throws when document has no extracted content", async () => {
    const t = convexTest(schema, await createModulesWithMockedLimits());
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const asUser = withAuth(t, userId);

    const docId = await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Test Paper",
        fileType: "paper_record",
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    await expect(
      asUser.action(api.documents.sourceGuide.generateSourceGuide, {
        documentId: docId,
      })
    ).rejects.toThrow("Document content not yet extracted");
  });
});

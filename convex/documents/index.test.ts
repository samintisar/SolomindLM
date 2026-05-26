/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

// Helper to create modules with mocked rate limits for source guide tests
async function createModulesWithMockedLimits() {
  const actualLimits = await modules["./_lib/limits.ts"]() as Record<string, unknown>;
  const { internalMutation } = await import("../_generated/server");
  const { v } = await import("convex/values");
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
        extractedMarkdown: "This is a comprehensive paper about neural networks and transformers in machine learning. It covers attention mechanisms, deep learning architectures, and natural language processing applications in detail.",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    // Mock Together AI API response
    const mockResponse = JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: "A paper about neural networks.",
              topics: ["AI", "ML", "NLP"],
            }),
          },
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => mockResponse,
        json: async () => JSON.parse(mockResponse),
      })) as unknown as typeof fetch
    );

    // Mock env module to provide API key
    vi.doMock("../_lib/env.js", () => ({
      env: {
        TOGETHER_AI_API_KEY: "test-key",
        FAST_LLM: "test-model",
      },
    }));

    // Mock rate limit functions
    vi.doMock("../_lib/limits.js", () => ({
      checkDailyLimit: vi.fn(),
      consumeDailyLimit: vi.fn(),
    }));

    const guide = await asUser.action(api.documents.index.generateSourceGuide, {
      documentId: docId,
    });

    expect(guide.summary).toBe("A paper about neural networks.");
    expect(guide.topics).toEqual(["AI", "ML", "NLP"]);

    // Verify stored in DB
    const doc = await t.run(async (ctx) => ctx.db.get(docId));
    expect(doc?.sourceGuide?.summary).toBe("A paper about neural networks.");
    expect(doc?.sourceGuide?.topics).toEqual(["AI", "ML", "NLP"]);

    vi.unstubAllGlobals();
    vi.doUnmock("../_lib/env.js");
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

    const guide = await asUser.action(api.documents.index.generateSourceGuide, {
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
      asUser.action(api.documents.index.generateSourceGuide, {
        documentId: docId,
      })
    ).rejects.toThrow("Document content not yet extracted");
  });
});

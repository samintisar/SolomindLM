import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import {
  assertCanEditNotebook,
  assertCanReadNotebook,
  getNotebookAccess,
} from "../_lib/notebookAccess";
import { getAuthUserId } from "../auth";

/**
 * Helper: Delete all chunks for a document.
 */
export async function deleteAllChunksForDocument(
  ctx: MutationCtx,
  documentId: Id<"documents">
): Promise<void> {
  const chunks = await ctx.db
    .query("documentChunks")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  for (const chunk of chunks) {
    await ctx.db.delete(chunk._id);
  }
}

/**
 * Internal: verify a user can resolve a file URL for this storage (document in a readable notebook).
 */
export const userCanAccessStorage = internalQuery({
  args: {
    userId: v.id("users"),
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!doc) return false;
    const access = await getNotebookAccess(ctx, doc.notebookId, args.userId);
    return access !== null;
  },
});

/**
 * Internal: Clear chunks, optionally swap Convex storage blob, reset doc fields, schedule embedding.
 */
export const prepareDocumentReembed = internalMutation({
  args: {
    documentId: v.id("documents"),
    delayMs: v.number(),
    newStorageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");

    if (args.newStorageId !== undefined) {
      if (doc.storageId) {
        await ctx.storage.delete(doc.storageId as Id<"_storage">);
      }
      await ctx.db.patch(args.documentId, {
        storageId: args.newStorageId,
        updatedAt: Date.now(),
      });
    }

    await deleteAllChunksForDocument(ctx, args.documentId);

    const before = await ctx.db.get(args.documentId);
    await ctx.db.patch(args.documentId, {
      status: "pending",
      error: undefined,
      wordCount: undefined,
      estimatedReadingTimeMinutes: undefined,
      totalPages: undefined,
      totalChunks: undefined,
      hasCodeBlocks: undefined,
      hasMathNotation: undefined,
      hasTables: undefined,
      hasImages: undefined,
      language: undefined,
      documentStructure: undefined,
      maxHeadingLevel: undefined,
      metadata: undefined,
      extractedMarkdown: undefined,
      ...(before?.fileType === "paper_record" ? { ingestionStatus: "pending" as const } : {}),
      updatedAt: Date.now(),
    });

    const after = await ctx.db.get(args.documentId);
    if (!after) throw new Error("Document not found");

    await ctx.scheduler.runAfter(args.delayMs, internal.documents.embeddingJob.docEmbedding, {
      documentId: args.documentId,
      userId: after.userId,
      notebookId: after.notebookId,
    });
  },
});

/**
 * Internal: List documents in a notebook when the user can read the notebook (for internal actions).
 */
export const listDocumentsForNotebookReadInternal = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await assertCanReadNotebook(ctx, args.notebookId, args.userId);
    return await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .order("desc")
      .collect();
  },
});

/**
 * Internal: Notebook documents for remote refresh (caller must pass authenticated user id).
 */
export const listDocumentsForNotebookRefresh = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await assertCanEditNotebook(ctx, args.notebookId, args.userId);
    return await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .collect();
  },
});

/**
 * Internal: Single document if the user can edit its notebook.
 */
export const getDocumentForRefresh = internalQuery({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    await assertCanEditNotebook(ctx, doc.notebookId, args.userId);
    return doc;
  },
});

/**
 * Internal: Update document status
 */
export const updateStatus = internalMutation({
  args: {
    documentId: v.id("documents"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update document title
 */
export const updateTitle = internalMutation({
  args: {
    documentId: v.id("documents"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      fileName: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: replace source URL (e.g. OpenAlex work page → DOI) before scrape / re-embed.
 */
export const setDocumentFileUrl = internalMutation({
  args: {
    documentId: v.id("documents"),
    fileUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      fileUrl: args.fileUrl,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Internal: Update document-level metadata
 */
export const setExtractedMarkdown = internalMutation({
  args: {
    documentId: v.id("documents"),
    extractedMarkdown: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      extractedMarkdown: args.extractedMarkdown,
      updatedAt: Date.now(),
    });
  },
});

export const updateMetadata = internalMutation({
  args: {
    documentId: v.id("documents"),
    metadata: v.object({
      wordCount: v.optional(v.number()),
      estimatedReadingTimeMinutes: v.optional(v.number()),
      totalPages: v.optional(v.number()),
      totalChunks: v.optional(v.number()),
      hasCodeBlocks: v.optional(v.boolean()),
      hasMathNotation: v.optional(v.boolean()),
      hasTables: v.optional(v.boolean()),
      hasImages: v.optional(v.boolean()),
      language: v.optional(v.string()),
      documentStructure: v.optional(v.union(v.literal("flat"), v.literal("hierarchical"))),
      maxHeadingLevel: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      ...args.metadata,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Patch document with partial updates
 */
export const patch = internalMutation({
  args: {
    documentId: v.id("documents"),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      ...args.patch,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Keyword search using full-text search index
 */
export const keywordSearch = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
    userId: v.id("users"), // Note: Using v.id("users") from Better Auth
    query: v.string(),
    limit: v.optional(v.number()),
    documentIds: v.optional(v.array(v.id("documents"))),
    /** When true, skip structured logs (deep research issues many keyword calls). */
    quietLogs: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const results = await ctx.db
      .query("documentChunks")
      .withSearchIndex("search_content", (q) =>
        q.search("content", args.query).eq("userId", args.userId).eq("notebookId", args.notebookId)
      )
      .take(limit);

    // User explicitly has no selected sources - return empty results
    if (args.documentIds && args.documentIds.length === 0) {
      return [];
    }

    // FIXED: Explicit length > 0 check
    let filtered = results;
    if (args.documentIds && args.documentIds.length > 0) {
      const docIdSet = new Set(args.documentIds.map((id) => id.toString()));
      filtered = results.filter(
        (r) => r.documentId !== undefined && docIdSet.has(r.documentId.toString())
      );
    }

    if (!args.quietLogs) {
      const log = createServiceLogger("documents", "keywordSearch", {
        userId: args.userId,
        notebookId: args.notebookId,
      });
      log.debug("query", {
        preview: args.query.slice(0, 120),
        raw: results.length,
        afterFilter: filtered.length,
        filteredByDocs: !!(args.documentIds && args.documentIds.length > 0),
      });
    }

    const uniqueDocIds = [...new Set(filtered.map((r) => r.documentId))];
    type DocId = NonNullable<(typeof filtered)[0]["documentId"]>;
    const docMetaMap = new Map<DocId, { fileName: string; sourceUrl?: string }>();
    for (const id of uniqueDocIds) {
      const doc = await ctx.db.get(id);
      const fileName = doc?.fileName ?? "Document";
      const u = doc?.fileUrl?.trim();
      const sourceUrl =
        u &&
        (doc?.fileType === "url" || doc?.fileType === "youtube" || doc?.fileType === "paper_record")
          ? u
          : undefined;
      docMetaMap.set(id, { fileName, sourceUrl });
    }

    return filtered.map((r) => {
      const meta = r.documentId ? docMetaMap.get(r.documentId) : undefined;
      return {
        _id: r._id,
        _score: 0,
        content: r.content,
        chunkIndex: r.chunkIndex,
        documentId: r.documentId,
        sourceTitle: meta?.fileName ?? "Document",
        sourceUrl: meta?.sourceUrl,
        // Include chunk metadata for enhanced RAG context
        metadata: {
          totalChunks: r.totalChunks,
          relativePosition: r.relativePosition,
          chunkLengthChars: r.chunkLengthChars,
          wordCount: r.wordCount,
          sentenceCount: r.sentenceCount,
          pageNumber: r.pageNumber,
          sectionTitle: r.sectionTitle,
          sectionLevel: r.sectionLevel,
          headingPath: r.headingPath,
          previousChunkPreview: r.previousChunkPreview,
          nextChunkPreview: r.nextChunkPreview,
          hasCodeBlock: r.hasCodeBlock,
          hasMathNotation: r.hasMathNotation,
          hasTable: r.hasTable,
          hasBulletList: r.hasBulletList,
          hasNumberedList: r.hasNumberedList,
        },
      };
    });
  },
});

/**
 * Internal: Get document details for job processing
 * Used by DocEmbeddingJob to fetch storage information
 */
export const getDocumentDetails = internalQuery({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) {
      throw new Error("Document not found");
    }
    return {
      storageId: doc.storageId,
      fileName: doc.fileName,
      fileType: doc.fileType,
      fileUrl: doc.fileUrl,
      paperRecord: doc.paperRecord,
      fulltextStatus: doc.fulltextStatus,
      ingestionStatus: doc.ingestionStatus,
      extractedMarkdown: doc.extractedMarkdown,
      notebookId: doc.notebookId,
      sourceGuide: doc.sourceGuide,
    };
  },
});

/**
 * Internal: Get document titles by IDs (for chat reference tooltips)
 */
export const getDocumentsByIds = internalQuery({
  args: {
    documentIds: v.array(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const uniqueIds = [...new Set(args.documentIds)];
    return Promise.all(
      uniqueIds.map(async (id) => {
        const doc = await ctx.db.get(id);
        return {
          _id: id,
          fileName: doc?.fileName ?? "Document",
          fileUrl: doc?.fileUrl,
          fileType: doc?.fileType,
        };
      })
    );
  },
});

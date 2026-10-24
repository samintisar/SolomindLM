import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { assertCanEditNotebook, assertCanReadNotebook } from "../_lib/notebookAccess";
import { getAuthUserId } from "../auth";
import { setDocumentText } from "./contents";

/**
 * Chunks deleted per mutation. Each chunk carries a 1536-dim embedding (~12 KB read), so one
 * mutation can't read a large source's chunks at once (16 MiB limit).
 */
export const CHUNK_DELETE_BATCH_SIZE = 100;

/** Deletes up to one batch of the document's chunks created at or before `before`; true if more remain. */
async function deleteChunkBatch(
  ctx: MutationCtx,
  documentId: Id<"documents">,
  before: number
): Promise<boolean> {
  const chunks = await ctx.db
    .query("documentChunks")
    .withIndex("by_document", (q) => q.eq("documentId", documentId).lte("_creationTime", before))
    .take(CHUNK_DELETE_BATCH_SIZE + 1);
  for (const chunk of chunks.slice(0, CHUNK_DELETE_BATCH_SIZE)) {
    await ctx.db.delete(chunk._id);
  }
  return chunks.length > CHUNK_DELETE_BATCH_SIZE;
}

/**
 * Deletes a document's chunks: the first batch now, the rest in scheduled batches
 * (`drainDocumentChunks`). Only chunks that exist now are deleted, so a re-embed can store new
 * chunks for the same document while the old ones drain. Retrieval drops chunks whose document
 * is gone (`chunks.getChunks`), so a deleted source stops showing up right away.
 */
export async function deleteAllChunksForDocument(
  ctx: MutationCtx,
  documentId: Id<"documents">
): Promise<void> {
  // The cutoff is the newest chunk that exists now (the index orders by _creationTime).
  const newest = await ctx.db
    .query("documentChunks")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .order("desc")
    .first();
  if (!newest) return;
  const before = newest._creationTime;
  if (await deleteChunkBatch(ctx, documentId, before)) {
    await ctx.scheduler.runAfter(0, internal.documents.internal.drainDocumentChunks, {
      documentId,
      before,
    });
  }
}

/** Internal: deletes the next batch of a document's old chunks and reschedules until none are left. */
export const drainDocumentChunks = internalMutation({
  args: { documentId: v.id("documents"), before: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await deleteChunkBatch(ctx, args.documentId, args.before)) {
      await ctx.scheduler.runAfter(0, internal.documents.internal.drainDocumentChunks, args);
    }
    return null;
  },
});

/**
 * True when a document other than `exceptDocumentIds` points at this stored file. Forks reuse
 * the original's file, so deleting one copy must leave the others readable.
 */
export async function isDocumentFileUsedElsewhere(
  ctx: MutationCtx,
  storageId: string,
  exceptDocumentIds: readonly Id<"documents">[] = []
): Promise<boolean> {
  const users = await ctx.db
    .query("documents")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .take(exceptDocumentIds.length + 1);
  return users.some((doc) => !exceptDocumentIds.includes(doc._id));
}

/**
 * Deletes a source's stored file unless another document still uses it (see
 * `isDocumentFileUsedElsewhere`). Call before deleting the document row, passing its id, or
 * after the row stopped referencing the file.
 */
export async function deleteDocumentFileIfUnused(
  ctx: MutationCtx,
  storageId: string,
  exceptDocumentIds: readonly Id<"documents">[] = []
): Promise<void> {
  if (await isDocumentFileUsedElsewhere(ctx, storageId, exceptDocumentIds)) return;
  await ctx.storage.delete(storageId as Id<"_storage">);
}

/** For actions that swapped a document's file: delete the old one if nothing else uses it. */
export const deleteDocumentFileIfUnusedInternal = internalMutation({
  args: { storageId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteDocumentFileIfUnused(ctx, args.storageId);
    return null;
  },
});

/**
 * Clear chunks, optionally swap the Convex storage blob, reset doc fields, schedule embedding.
 * A new blob also clears `fullTextSource` (an uploaded PDF replaces whatever was there); a plain
 * reprocess keeps it, so a stored open-access PDF keeps its provenance.
 */
export async function resetDocumentForReembed(
  ctx: MutationCtx,
  args: { documentId: Id<"documents">; delayMs: number; newStorageId?: string }
): Promise<void> {
  const doc = await ctx.db.get(args.documentId);
  if (!doc) throw new Error("Document not found");

  if (args.newStorageId !== undefined) {
    if (doc.storageId) {
      await deleteDocumentFileIfUnused(ctx, doc.storageId, [doc._id]);
    }
    await ctx.db.patch(args.documentId, {
      storageId: args.newStorageId,
      fullTextSource: undefined,
      updatedAt: Date.now(),
    });
  }

  await deleteAllChunksForDocument(ctx, args.documentId);
  await setDocumentText(ctx, args.documentId, undefined);

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
}

/**
 * Internal: Clear chunks, optionally swap Convex storage blob, reset doc fields, schedule embedding.
 */
export const prepareDocumentReembed = internalMutation({
  args: {
    documentId: v.id("documents"),
    delayMs: v.number(),
    newStorageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => resetDocumentForReembed(ctx, args),
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
    await setDocumentText(ctx, args.documentId, args.extractedMarkdown);
    await ctx.db.patch(args.documentId, { updatedAt: Date.now() });
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
 * Internal: Keyword search using full-text search index, scoped to one notebook. Callers check
 * notebook access first; chunks carry the uploader's userId, so filtering by the caller's id would
 * hide every source a Cowork editor or public-notebook viewer did not upload.
 */
export const keywordSearch = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
    /** For logs only. */
    userId: v.id("users"),
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
        q.search("content", args.query).eq("notebookId", args.notebookId)
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
      fullTextSource: doc.fullTextSource,
      fullTextPolicy: doc.fullTextPolicy,
      notebookId: doc.notebookId,
      sourceGuide: doc.sourceGuide,
    };
  },
});

/**
 * Internal: the selected documents that are in the notebook, with their titles, reading only the
 * selected rows (#450). Ids come from the client, so malformed, deleted or other notebooks' ids are
 * dropped rather than trusted.
 */
export const listNotebookDocumentTitles = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const rows: Array<{ _id: Id<"documents">; fileName: string }> = [];
    for (const raw of new Set(args.documentIds)) {
      const id = ctx.db.normalizeId("documents", raw);
      const doc = id ? await ctx.db.get(id) : null;
      if (doc && doc.notebookId === args.notebookId) {
        rows.push({ _id: doc._id, fileName: doc.fileName });
      }
    }
    return rows;
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

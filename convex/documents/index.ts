import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  internalAction,
  type MutationCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { getAuthUserId } from "../auth";
import { checkSourceLimit } from "../_lib/limits";
import { assertCanEditNotebook, assertCanReadNotebook } from "../_lib/notebookAccess";

async function deleteAllChunksForDocument(
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
 * Get a presigned URL for uploading a file to Convex Storage
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Upload a document (file, URL, YouTube, or text)
 */
export const upload = mutation({
  args: {
    notebookId: v.id("notebooks"),
    type: v.string(),
    source: v.optional(v.string()),
    storageId: v.optional(v.string()),
    fileName: v.string(),
    fileSize: v.optional(v.number()),
    contentType: v.optional(v.string()), // e.g. application/pdf — used when fileName has no extension
    googleDriveFileId: v.optional(v.string()),
    googleDriveMimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    // Check source limit
    await checkSourceLimit(ctx, args.notebookId);

    // Validate type
    const validTypes = ["file", "url", "youtube", "text"];
    if (!validTypes.includes(args.type)) {
      throw new Error(`Invalid type. Must be one of: ${validTypes.join(", ")}`);
    }

    // Validate required fields based on type
    if (args.type === "file" && !args.storageId) {
      throw new Error("storageId is required for file uploads");
    }
    if ((args.type === "url" || args.type === "youtube" || args.type === "text") && !args.source) {
      throw new Error("source is required for url/youtube/text type");
    }

    if (args.type === "file" && (args.googleDriveFileId || args.googleDriveMimeType)) {
      if (!args.googleDriveFileId || !args.googleDriveMimeType) {
        throw new Error(
          "googleDriveFileId and googleDriveMimeType must both be set for Drive-backed files"
        );
      }
    }

    const now = Date.now();

    const documentId = await ctx.db.insert("documents", {
      userId,
      notebookId: args.notebookId,
      fileName: args.fileName,
      fileType: args.type,
      fileSize: args.fileSize,
      storageId: args.storageId,
      contentType: args.contentType,
      googleDriveFileId: args.googleDriveFileId,
      googleDriveMimeType: args.googleDriveMimeType,
      fileUrl:
        args.type === "url" || args.type === "youtube" || args.type === "text"
          ? args.source
          : undefined,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    // Schedule embedding job; stagger YouTube jobs to avoid Supadata "Limit Exceeded" when uploading multiple at once
    const delayMs = args.type === "youtube" ? Math.floor(Math.random() * 8000) : 0;
    await ctx.scheduler.runAfter(delayMs, internal.documents.embeddingJob.docEmbedding, {
      documentId,
      userId,
      notebookId: args.notebookId,
    });

    return {
      documentId,
      status: "pending",
      message: "Document uploaded successfully",
    };
  },
});

/**
 * Get a document by ID
 */
export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const document = await ctx.db.get(args.id);

    if (!document) {
      return null;
    }

    try {
      await assertCanReadNotebook(ctx, document.notebookId, userId);
    } catch {
      return null;
    }

    return document;
  },
});

/**
 * Get all documents for a notebook
 */
export const list = query({
  args: { notebookId: v.optional(v.id("notebooks")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    if (args.notebookId) {
      await assertCanReadNotebook(ctx, args.notebookId, userId);

      return await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId!))
        .order("desc")
        .collect();
    }

    // Get all documents for user
    return await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get document content for the source viewer (prefers full `extractedMarkdown`, else stitched chunks).
 */
export const getContent = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const document = await ctx.db.get(args.id);
    if (!document) {
      return null;
    }

    try {
      await assertCanReadNotebook(ctx, document.notebookId, userId);
    } catch {
      return null;
    }

    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();

    const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    const stored = document.extractedMarkdown?.trim();
    if (stored) {
      return {
        documentId: args.id,
        content: stored,
        chunkCount: sortedChunks.length,
      };
    }

    if (sortedChunks.length === 0) {
      throw new Error("Document content not found");
    }

    // Legacy: stitched chunks (overlapping); prefer re-ingesting for clean view
    const fullContent = sortedChunks.map((chunk) => chunk.content).join("\n");

    return {
      documentId: args.id,
      content: fullContent,
      chunkCount: sortedChunks.length,
    };
  },
});

/**
 * Get a signed URL for a document's storage file
 */
export const getSignedUrl = mutation({
  args: { storageId: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const document = await ctx.db
      .query("documents")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();

    if (!document) {
      throw new Error("Document not found");
    }

    await assertCanReadNotebook(ctx, document.notebookId, userId);

    return await ctx.storage.getUrl(args.storageId as Id<"_storage">);
  },
});

// Known file extensions so we can preserve them when renaming (keeps PDF/DOCX etc. labels correct)
const FILE_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "doc",
  "pptx",
  "ppt",
  "xlsx",
  "xls",
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "avif",
  "wav",
  "mp3",
  "m4a",
  "webm",
  "flac",
]);

/**
 * Update a document title.
 * For file documents, preserves the existing extension if the new title doesn't include one,
 * so the source continues to display as PDF/DOCX etc. instead of falling back to DOC.
 */
export const update = mutation({
  args: {
    id: v.id("documents"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const { id, title } = args;

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Document not found");
    }

    await assertCanEditNotebook(ctx, existing.notebookId, userId);

    let newFileName = title.trim();

    if (existing.fileType === "file" && existing.fileName) {
      const lastDot = existing.fileName.lastIndexOf(".");
      const existingExt = lastDot >= 0 ? existing.fileName.slice(lastDot + 1).toLowerCase() : "";
      if (existingExt && FILE_EXTENSIONS.has(existingExt)) {
        const newLastDot = newFileName.lastIndexOf(".");
        const newExt = newLastDot >= 0 ? newFileName.slice(newLastDot + 1).toLowerCase() : "";
        if (!newExt || !FILE_EXTENSIONS.has(newExt)) {
          newFileName = newFileName + (newFileName.endsWith(".") ? "" : ".") + existingExt;
        }
      }
    }

    await ctx.db.patch(id, {
      fileName: newFileName,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

/**
 * Delete a document
 */
export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const document = await ctx.db.get(args.id);
    if (!document) {
      throw new Error("Document not found");
    }

    await assertCanEditNotebook(ctx, document.notebookId, userId);

    await deleteAllChunksForDocument(ctx, args.id);

    if (document.storageId) {
      await ctx.storage.delete(document.storageId as Id<"_storage">);
    }

    await ctx.db.delete(args.id);

    return { message: "Document deleted successfully" };
  },
});

/**
 * Delete multiple documents (same cleanup as remove).
 */
export const removeMany = mutation({
  args: { ids: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    if (args.ids.length === 0) {
      return { deleted: 0 };
    }

    let deleted = 0;
    for (const id of args.ids) {
      const document = await ctx.db.get(id);
      if (!document) continue;

      await assertCanEditNotebook(ctx, document.notebookId, userId);

      await deleteAllChunksForDocument(ctx, id);

      if (document.storageId) {
        await ctx.storage.delete(document.storageId as Id<"_storage">);
      }

      await ctx.db.delete(id);
      deleted += 1;
    }

    return { deleted };
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
 * Internal: Update document-level metadata
 */
/**
 * Full extracted markdown for source viewer / copy (single string, no chunk overlap).
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
 * Internal: List chunks by document
 */
export const listChunksByDocument = internalQuery({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("asc")
      .collect();

    return chunks;
  },
});

/**
 * Internal: Get chunks by IDs
 */
export const getChunks = internalQuery({
  args: {
    chunkIds: v.array(v.id("documentChunks")),
  },
  handler: async (ctx, args) => {
    return await Promise.all(args.chunkIds.map((id) => ctx.db.get(id)));
  },
});

/**
 * Internal: List chunks by notebook (for debugging)
 */
export const listChunksByNotebook = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .collect();
    return chunks;
  },
});

/**
 * Internal: Fetch chunks for documents (for use in agents)
 * This combines vector search with full chunk retrieval
 */
export const fetchChunks = internalAction({
  args: {
    documentIds: v.array(v.id("documents")),
  },
  handler: async (ctx, args) => {
    "use node";

    // Get all chunks for the specified documents
    const allChunks: any[] = [];

    for (const documentId of args.documentIds) {
      const chunks = await ctx.runQuery(internal.documents.index.listChunksByDocument, {
        documentId,
      });
      allChunks.push(...chunks);
    }

    // Sort by document and chunk index
    allChunks.sort((a, b) => {
      if (a.documentId !== b.documentId) {
        return a.documentId.localeCompare(b.documentId);
      }
      return a.chunkIndex - b.chunkIndex;
    });

    return allChunks;
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
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    console.log(`[keywordSearch] query="${args.query.slice(0, 80)}..."`);

    const results = await ctx.db
      .query("documentChunks")
      .withSearchIndex("search_content", (q) =>
        q.search("content", args.query).eq("userId", args.userId).eq("notebookId", args.notebookId)
      )
      .take(limit);

    console.log(`[keywordSearch] raw=${results.length}`);

    // FIXED: Explicit length > 0 check
    let filtered = results;
    if (args.documentIds && args.documentIds.length > 0) {
      const docIdSet = new Set(args.documentIds.map((id) => id.toString()));
      filtered = results.filter(
        (r) => r.documentId !== undefined && docIdSet.has(r.documentId.toString())
      );
      console.log(`[keywordSearch] after filter=${filtered.length}`);
    }

    const uniqueDocIds = [...new Set(filtered.map((r) => r.documentId))];
    type DocId = NonNullable<(typeof filtered)[0]["documentId"]>;
    const docMetaMap = new Map<DocId, { fileName: string; sourceUrl?: string }>();
    for (const id of uniqueDocIds) {
      const doc = await ctx.db.get(id);
      const fileName = doc?.fileName ?? "Document";
      const u = doc?.fileUrl?.trim();
      const sourceUrl =
        u && (doc?.fileType === "url" || doc?.fileType === "youtube") ? u : undefined;
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

/**
 * Internal: Store a document chunk with embedding and metadata
 */
export const storeChunk = internalMutation({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    content: v.string(),
    chunkIndex: v.number(),
    embedding: v.array(v.float64()),
    metadata: v.optional(
      v.object({
        totalChunks: v.optional(v.number()),
        relativePosition: v.optional(v.number()),
        chunkLengthChars: v.optional(v.number()),
        wordCount: v.optional(v.number()),
        sentenceCount: v.optional(v.number()),
        pageNumber: v.optional(v.number()),
        sectionTitle: v.optional(v.string()),
        sectionLevel: v.optional(v.number()),
        headingPath: v.optional(v.array(v.string())),
        previousChunkPreview: v.optional(v.string()),
        nextChunkPreview: v.optional(v.string()),
        hasCodeBlock: v.optional(v.boolean()),
        hasMathNotation: v.optional(v.boolean()),
        hasTable: v.optional(v.boolean()),
        hasBulletList: v.optional(v.boolean()),
        hasNumberedList: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const chunkData: any = {
      documentId: args.documentId,
      userId: args.userId,
      notebookId: args.notebookId,
      content: args.content,
      chunkIndex: args.chunkIndex,
      embedding: args.embedding,
      createdAt: Date.now(),
    };

    // Add metadata fields if provided
    if (args.metadata) {
      chunkData.totalChunks = args.metadata.totalChunks;
      chunkData.relativePosition = args.metadata.relativePosition;
      chunkData.chunkLengthChars = args.metadata.chunkLengthChars;
      chunkData.wordCount = args.metadata.wordCount;
      chunkData.sentenceCount = args.metadata.sentenceCount;
      chunkData.pageNumber = args.metadata.pageNumber;
      chunkData.sectionTitle = args.metadata.sectionTitle;
      chunkData.sectionLevel = args.metadata.sectionLevel;
      chunkData.headingPath = args.metadata.headingPath;
      chunkData.previousChunkPreview = args.metadata.previousChunkPreview;
      chunkData.nextChunkPreview = args.metadata.nextChunkPreview;
      chunkData.hasCodeBlock = args.metadata.hasCodeBlock;
      chunkData.hasMathNotation = args.metadata.hasMathNotation;
      chunkData.hasTable = args.metadata.hasTable;
      chunkData.hasBulletList = args.metadata.hasBulletList;
      chunkData.hasNumberedList = args.metadata.hasNumberedList;
    }

    await ctx.db.insert("documentChunks", chunkData);
  },
});

import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, internalAction, action } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";
import { checkSourceLimit } from "./lib/limits";
import { TavilySearchService } from "./lib/discovery/TavilySearchService";

/**
 * Get a presigned URL for uploading a file to Convex Storage
 */
export const generateUploadUrl = mutation({
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Verify user owns the notebook
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      throw new Error("Notebook not found");
    }

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

    const now = Date.now();

    const documentId = await ctx.db.insert("documents", {
      userId,
      notebookId: args.notebookId,
      fileName: args.fileName,
      fileType: args.type,
      fileSize: args.fileSize,
      storageId: args.storageId,
      contentType: args.contentType,
      fileUrl: (args.type === "url" || args.type === "youtube" || args.type === "text") ? args.source : undefined,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    // Schedule embedding job; stagger YouTube jobs to avoid Supadata "Limit Exceeded" when uploading multiple at once
    const delayMs =
      args.type === 'youtube' ? Math.floor(Math.random() * 8000) : 0;
    await ctx.scheduler.runAfter(delayMs, internal.jobs.DocEmbeddingJob.docEmbedding, {
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

    if (!document || document.userId !== userId) {
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
      // Verify user owns the notebook
      const notebook = await ctx.db.get(args.notebookId);
      if (!notebook || notebook.userId !== userId) {
        throw new Error("Notebook not found");
      }

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
 * Get document content from chunks
 */
export const getContent = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const document = await ctx.db.get(args.id);
    if (!document || document.userId !== userId) {
      return null;
    }

    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();

    if (chunks.length === 0) {
      throw new Error("Document content not found");
    }

    // Sort by chunk index and reconstruct. Use single newline so we don't insert
    // blank lines inside markdown tables when chunk boundaries fall mid-table
    // (GFM treats a blank line as ending the table, which breaks rendering).
    const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const fullContent = sortedChunks.map((chunk) => chunk.content).join("\n");

    return {
      documentId: args.id,
      content: fullContent,
      chunkCount: chunks.length,
    };
  },
});

/**
 * Get a signed URL for a document's storage file
 */
export const getSignedUrl = mutation({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    // Verify user owns a document with this storageId
    const document = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("storageId"), args.storageId))
      .first();

    if (!document) {
      throw new Error("Document not found");
    }

    return await ctx.storage.getUrl(args.storageId as Id<"_storage">);
  },
});

// Known file extensions so we can preserve them when renaming (keeps PDF/DOCX etc. labels correct)
const FILE_EXTENSIONS = new Set([
  'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'txt', 'md', 'markdown',
  'json', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif',
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

    // Verify ownership
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Document not found");
    }

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
    if (!document || document.userId !== userId) {
      throw new Error("Document not found");
    }

    // Delete file from storage if it exists
    if (document.storageId) {
      await ctx.storage.delete(document.storageId as Id<'_storage'>);
    }

    // Delete from database (chunks will need to be deleted separately)
    await ctx.db.delete(args.id);

    // Delete associated chunks
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();

    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    return { message: "Document deleted successfully" };
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
    return await Promise.all(
      args.chunkIds.map((id) => ctx.db.get(id))
    );
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
      const chunks = await ctx.runQuery(internal.documents.listChunksByDocument, {
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
    userId: v.id("users"),  // Note: Using v.id("users") from Better Auth
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
        q
          .search("content", args.query)
          .eq("userId", args.userId)
          .eq("notebookId", args.notebookId)
      )
      .take(limit);

    console.log(`[keywordSearch] raw=${results.length}`);

    // FIXED: Explicit length > 0 check
    let filtered = results;
    if (args.documentIds && args.documentIds.length > 0) {
      const docIdSet = new Set(
        args.documentIds.map((id) => id.toString())
      );
      filtered = results.filter((r) =>
        r.documentId !== undefined && docIdSet.has(r.documentId.toString())
      );
      console.log(`[keywordSearch] after filter=${filtered.length}`);
    }

    const uniqueDocIds = [...new Set(filtered.map((r) => r.documentId))];
    const docTitleMap = new Map<typeof filtered[0]["documentId"], string>();
    for (const id of uniqueDocIds) {
      const doc = await ctx.db.get(id);
      docTitleMap.set(id, doc?.fileName ?? "Document");
    }

    return filtered.map((r) => ({
      _id: r._id,
      _score: 0,
      content: r.content,
      chunkIndex: r.chunkIndex,
      documentId: r.documentId,
      sourceTitle: docTitleMap.get(r.documentId) ?? "Document",
    }));
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
      throw new Error('Document not found');
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
        return { _id: id, fileName: doc?.fileName ?? "Document" };
      })
    );
  },
});

/**
 * Internal: Store a document chunk with embedding
 */
export const storeChunk = internalMutation({
  args: {
    documentId: v.id('documents'),
    userId: v.id('users'),
    notebookId: v.id('notebooks'),
    content: v.string(),
    chunkIndex: v.number(),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('documentChunks', {
      documentId: args.documentId,
      userId: args.userId,
      notebookId: args.notebookId,
      content: args.content,
      chunkIndex: args.chunkIndex,
      embedding: args.embedding,
      createdAt: Date.now(),
    });
  },
});

/**
 * Discover web sources using Tavily Search API
 * This is an action because it makes external API calls
 */
export const discoverSources = action({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
    scoreThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const maxResults = args.maxResults ?? 5;
    const scoreThreshold = args.scoreThreshold ?? 0.5;
    const tavily = new TavilySearchService();
    const discovered = await tavily.discoverSources({
      query: args.query,
      maxResults,
      scoreThreshold,
    });

    const sources = discovered.map((s) => ({
      url: s.url,
      title: s.title,
      snippet: s.snippet,
      publishedDate: null as string | null,
      score: s.score,
    }));

    return {
      sources,
      query: args.query,
    };
  },
});

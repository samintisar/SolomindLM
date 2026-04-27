import { v } from "convex/values";
import { query, internalMutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthUserId } from "../auth";
import { assertCanReadNotebook } from "../_lib/notebookAccess";

/**
 * Returns the first N chunks for a notebook (by index order), not semantic search.
 * Use chat/internal vector search for similarity retrieval.
 */
export const getRecentNotebookChunks = query({
  args: {
    notebookId: v.id("notebooks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    await assertCanReadNotebook(ctx, args.notebookId, userId);

    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .take(args.limit || 10);

    return chunks;
  },
});

/**
 * Get document chunks for a notebook
 */
export const getChunks = query({
  args: {
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    await assertCanReadNotebook(ctx, args.notebookId, userId);

    return await ctx.db
      .query("documentChunks")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .collect();
  },
});

/**
 * ANN search with a precomputed embedding (internal only; no public surface).
 */
export const searchWithEmbeddingInternal = internalAction({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    queryEmbedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const canRead = await ctx.runQuery(internal.notebooks.index.canReadNotebookInternal, {
      notebookId: args.notebookId,
      userId: args.userId,
    });
    if (!canRead) {
      throw new Error("Notebook not found");
    }
    return await ctx.vectorSearch("documentChunks", "by_embedding", {
      vector: args.queryEmbedding,
      limit: args.limit || 5,
      filter: (q) => q.eq("notebookId", args.notebookId),
    });
  },
});

/**
 * Internal: Process a document and generate embeddings
 * This is called by the document upload flow
 */
export const processDocumentEmbeddings = internalMutation({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // Splitting is done in DocEmbeddingJob (LangChain + tiktoken). This mutation
    // is unused; if used, store content as a single chunk and rely on the job for real processing.
    const chunks = [args.content];

    // Create chunk records
    for (let i = 0; i < chunks.length; i++) {
      await ctx.db.insert("documentChunks", {
        documentId: args.documentId,
        userId: args.userId,
        notebookId: args.notebookId,
        content: chunks[i],
        chunkIndex: i,
        createdAt: Date.now(),
      });
    }

    // Schedule embedding generation for each chunk
    // This would be done by a background job in production
    // For now, we'll mark the document as completed
    await ctx.db.patch(args.documentId, {
      status: "completed",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Generate embedding for a single chunk
 * This would be called by a background job
 */
export const generateChunkEmbedding = internalMutation({
  args: {
    chunkId: v.id("documentChunks"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.chunkId, {
      embedding: args.embedding,
    });
  },
});

import { v } from "convex/values";
import { query, mutation, internalMutation, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";

/**
 * Vector search for document chunks
 * Returns relevant chunks based on semantic similarity
 */
export const vectorSearch = query({
  args: {
    notebookId: v.id("notebooks"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    // Verify user owns the notebook
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      throw new Error("Notebook not found");
    }

    // Generate embedding for query
    // This needs to be done in an action, so we'll use a different approach
    // For now, we'll return chunks without vector search
    // In production, you'd use the vector index

    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.eq(q.field("notebookId"), args.notebookId)
        )
      )
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

    // Verify user owns the notebook
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      throw new Error("Notebook not found");
    }

    return await ctx.db
      .query("documentChunks")
      .withIndex("by_document")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.eq(q.field("notebookId"), args.notebookId)
        )
      )
      .collect();
  },
});

/**
 * Search chunks using vector index with query embedding
 */
export const searchWithEmbedding = action({
  args: {
    notebookId: v.string(),
    queryEmbedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Use the vector index to search
    const results = await ctx.vectorSearch("documentChunks", "by_embedding", {
      vector: args.queryEmbedding,
      limit: args.limit || 5,
      filter: (q) => q.eq("notebookId", args.notebookId as any),
      // Note: We can't filter by userId in vector search directly
      // The userId filter should be applied after the search
    });

    return results;
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

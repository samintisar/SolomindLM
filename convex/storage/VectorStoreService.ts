import { internalMutation, internalAction } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { v } from 'convex/values';
import { internal } from '../_generated/api';

export interface ChunkWithEmbedding {
  content: string;
  embedding: number[];
  index: number;
}

/**
 * Store document chunks with embeddings in Convex
 * This is an internal mutation that handles the database writes
 */
export const storeChunks = internalMutation({
  args: {
    documentId: v.id('documents'),
    userId: v.id('users'),
    notebookId: v.id('notebooks'),
    chunks: v.array(
      v.object({
        content: v.string(),
        embedding: v.array(v.float64()),
        index: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { documentId, userId, notebookId, chunks } = args;

    console.log('[VectorStore] Storing chunks:', {
      documentId,
      chunkCount: chunks.length,
    });

    // Insert all chunks
    for (const chunk of chunks) {
      await ctx.db.insert('documentChunks', {
        documentId,
        userId,
        notebookId,
        chunkIndex: chunk.index,
        content: chunk.content,
        embedding: chunk.embedding,
        createdAt: Date.now(),
      });
    }

    console.log('[VectorStore] Chunks stored successfully');
  },
});

/**
 * Perform vector similarity search using Convex's built-in vector search
 * This MUST be an action because vector search is not available in queries/mutations
 */
export const similaritySearch = internalAction({
  args: {
    userId: v.string(),
    notebookId: v.id('notebooks'),
    queryEmbedding: v.array(v.float64()),
    limit: v.optional(v.number()),
    documentIds: v.optional(v.array(v.id('documents'))),
  },
  handler: async (ctx, args) => {
    "use node";

    const { userId, notebookId, queryEmbedding, limit = 5, documentIds } = args;

    console.log('[VectorStore] Performing similarity search:', {
      notebookId,
      limit,
    });

    // Perform vector search (filter supports only single eq or q.or; filterFields are userId, notebookId)
    const results = await ctx.vectorSearch('documentChunks', 'by_embedding', {
      vector: queryEmbedding,
      limit: (documentIds?.length ? 256 : limit) ?? limit,
      filter: (q) => q.eq('notebookId', notebookId),
    });

    // Post-filter by userId and documentIds (vector filter can't express AND or filter by documentId)
    const chunkIds = results.map((r) => r._id);
    const rawChunks: (Doc<'documentChunks'> | null)[] =
      chunkIds.length > 0
        ? await ctx.runQuery(internal.documents.getChunks, { chunkIds })
        : [];
    const chunks = rawChunks.filter(
      (c): c is Doc<'documentChunks'> => c !== null
    );
    const validIds = new Set(
      chunks
        .filter(
          (c) =>
            c.userId === userId &&
            (!documentIds?.length || documentIds.includes(c.documentId))
        )
        .map((c) => c._id)
    );
    const filteredResults = results.filter((r) => validIds.has(r._id));
    const chunkById = new Map(chunks.map((c) => [c._id, c]));

    // Return full chunk data + score for chat/reranking consumers
    const enriched = filteredResults
      .map((r) => {
        const c = chunkById.get(r._id);
        if (!c) return null;
        return {
          _id: c._id,
          _score: r._score ?? 0,
          content: c.content,
          chunkIndex: c.chunkIndex,
          documentId: c.documentId,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    console.log('[VectorStore] Search completed:', {
      resultCount: enriched.length,
    });

    return enriched;
  },
});

/**
 * Perform hybrid search combining vector similarity with keyword filtering
 * This is a simplified version that uses vector search with additional filters
 */
export const hybridSearch = internalAction({
  args: {
    userId: v.string(),
    notebookId: v.id('notebooks'),
    queryText: v.string(),
    queryEmbedding: v.array(v.float64()),
    limit: v.optional(v.number()),
    documentIds: v.optional(v.array(v.id('documents'))),
    matchThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    "use node";

    const { userId, notebookId, queryText, queryEmbedding, limit = 10, documentIds } = args;

    console.log('[VectorStore] Performing hybrid search:', {
      notebookId,
      queryText,
      limit,
    });

    // Perform vector search (filter supports only single eq or q.or; filterFields are userId, notebookId)
    const results = await ctx.vectorSearch('documentChunks', 'by_embedding', {
      vector: queryEmbedding,
      limit: (documentIds?.length ? 256 : limit) ?? limit,
      filter: (q) => q.eq('notebookId', notebookId),
    });

    // Get full chunk data and post-filter by userId and documentIds
    const chunkIds = results.map((r) => r._id);
    const rawChunks: (Doc<'documentChunks'> | null)[] =
      chunkIds.length > 0
        ? await ctx.runQuery(internal.documents.getChunks, { chunkIds })
        : [];
    const allChunks = rawChunks.filter(
      (c): c is Doc<'documentChunks'> => c !== null
    );
    const chunks = allChunks.filter(
      (c) =>
        c.userId === userId &&
        (!documentIds?.length || documentIds.includes(c.documentId))
    );

    console.log('[VectorStore] Hybrid search completed:', {
      resultCount: chunks.length,
    });

    return chunks;
  },
});

/**
 * Get all chunks for a document
 */
export const getDocumentChunks = internalAction({
  args: {
    documentId: v.id('documents'),
  },
  handler: async (ctx, args): Promise<Doc<'documentChunks'>[]> => {
    "use node";

    const chunks: Doc<'documentChunks'>[] =
      await ctx.runQuery(internal.documents.listChunksByDocument, {
        documentId: args.documentId,
      });

    return chunks;
  },
});

/**
 * Delete all chunks for a document
 */
export const deleteDocumentChunks = internalMutation({
  args: {
    documentId: v.id('documents'),
  },
  handler: async (ctx, args) => {
    const { documentId } = args;

    // Get all chunks for this document
    const chunks = await ctx.db
      .query('documentChunks')
      .withIndex('by_document', (q) => q.eq('documentId', documentId))
      .collect();

    // Delete all chunks
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    console.log('[VectorStore] Deleted chunks:', {
      documentId,
      count: chunks.length,
    });
  },
});

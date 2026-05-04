/**
 * Migration: Re-embed all document chunks with Together AI
 *
 * This script migrates from OpenAI text-embedding-3-small (1536 dimensions)
 * to Together AI intfloat/multilingual-e5-large-instruct (1024 dimensions)
 *
 * Run batched migration: npx convex run _migration/reembedChunks:reembedAllChunks
 *
 * Production: uses scheduled batches to avoid action timeouts and large .collect() reads.
 */

import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";

/**
 * Query to get all document chunks (small dev datasets only)
 */
export const listAllChunks = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("documentChunks").collect();
  },
});

/** Paginate `documentChunks` for batched re-embedding (ascending _id order). */
export const listDocumentChunksPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db.query("documentChunks").order("asc").paginate(args.paginationOpts);
  },
});

/**
 * Query to get chunks for a specific document
 */
export const listChunksByDocument = internalQuery({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
  },
});

/**
 * Mutation to update a single chunk's embedding
 */
export const updateChunkEmbedding = internalMutation({
  args: {
    chunkId: v.id("documentChunks"),
    newEmbedding: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const { chunkId, newEmbedding } = args;

    // Verify the chunk exists
    const chunk = await ctx.db.get(chunkId);
    if (!chunk) {
      throw new Error(`Chunk ${chunkId} not found`);
    }

    // Update with new embedding
    await ctx.db.patch(chunkId, {
      embedding: newEmbedding,
    });

    return { success: true, chunkId };
  },
});

/**
 * Start batched re-embedding (schedules work; safe for large `documentChunks` tables).
 */
export const reembedAllChunks = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal._migration.reembedBatchesWorker.reembedBatchesWorker, {
      cursor: null,
      processed: 0,
      errors: 0,
    });
    return { scheduled: true, message: "Re-embedding started; watch logs for reembedBatchesWorker progress." };
  },
});

/**
 * Helper action to re-embed chunks for a specific document
 * Useful for testing or partial migrations
 */
export const reembedDocumentChunks = internalAction({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args): Promise<{ total: number; processed: number; errors: number }> => {
    "use node";

    const togetherApiKey = process.env.TOGETHER_AI_API_KEY;
    if (!togetherApiKey) {
      throw new Error("TOGETHER_AI_API_KEY environment variable not set");
    }

    const embeddingService = new EmbeddingService(togetherApiKey);

    // Get chunks for the specific document
    const chunks = await ctx.runQuery(internal._migration.reembedChunks.listChunksByDocument, {
      documentId: args.documentId,
    });

    console.log(`Found ${chunks.length} chunks for document ${args.documentId}`);

    if (chunks.length === 0) {
      return { total: 0, processed: 0, errors: 0 };
    }

    // Generate new embeddings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const texts = chunks.map((chunk: any) => chunk.content);
    const newEmbeddings = await embeddingService.embedBatch(texts);

    // Update chunks
    let processed = 0;
    for (let i = 0; i < chunks.length; i++) {
      await ctx.runMutation(internal._migration.reembedChunks.updateChunkEmbedding, {
        chunkId: chunks[i]._id,
        newEmbedding: newEmbeddings[i],
      });
      processed++;
    }

    console.log(`Document ${args.documentId}: ${processed} chunks updated`);

    return {
      total: chunks.length,
      processed,
      errors: 0,
    };
  },
});

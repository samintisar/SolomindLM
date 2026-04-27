/**
 * Migration: Re-embed all document chunks with Together AI
 *
 * This script migrates from OpenAI text-embedding-3-small (1536 dimensions)
 * to Together AI intfloat/multilingual-e5-large-instruct (1024 dimensions)
 *
 * Run via: npx convex run _migration/reembedChunks
 */

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";

/**
 * Query to get all document chunks
 */
export const listAllChunks = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("documentChunks").collect();
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
 * Migration action to re-embed all existing document chunks
 *
 * This will:
 * 1. Fetch all existing document chunks
 * 2. Re-generate embeddings using Together AI
 * 3. Update chunks with new 1024-dimension embeddings
 */
export const reembedAllChunks = internalAction({
  args: {},
  handler: async (ctx): Promise<{ total: number; processed: number; errors: number }> => {
    "use node";

    const togetherApiKey = process.env.TOGETHER_AI_API_KEY;
    if (!togetherApiKey) {
      throw new Error("TOGETHER_AI_API_KEY environment variable not set");
    }

    const embeddingService = new EmbeddingService(togetherApiKey);

    // Get all document chunks using query
    const allChunks = await ctx.runQuery(internal._migration.reembedChunks.listAllChunks);

    console.log(`Found ${allChunks.length} chunks to re-embed`);

    // Process in batches to avoid timeouts
    const BATCH_SIZE = 50;
    let processed = 0;
    let errors = 0;

    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      const batch = allChunks.slice(i, Math.min(i + BATCH_SIZE, allChunks.length));

      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allChunks.length / BATCH_SIZE)}`);

      try {
        // Generate new embeddings for the batch
        const texts = batch.map((chunk: any) => chunk.content);
        const newEmbeddings = await embeddingService.embedBatch(texts);

        // Update each chunk with its new embedding
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const newEmbedding = newEmbeddings[j];

          await ctx.runMutation(internal._migration.reembedChunks.updateChunkEmbedding, {
            chunkId: chunk._id,
            newEmbedding,
          });

          processed++;
        }

        console.log(`  Batch complete: ${batch.length} chunks updated`);
      } catch (error) {
        console.error(`  Error processing batch starting at index ${i}:`, error);
        errors += batch.length;
      }
    }

    console.log(`Migration complete: ${processed} chunks updated, ${errors} errors`);

    return {
      total: allChunks.length,
      processed,
      errors,
    };
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

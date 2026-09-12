"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { EMBEDDING_MODEL } from "../_lib/embeddingConfig";
import { EmbeddingService } from "../_services/ai/embeddingClient";

const BATCH_SIZE = 40;

/**
 * Worker: processes one page of chunks, skips ones already stamped with
 * `embeddingModel === EMBEDDING_MODEL`, then reschedules until done.
 *
 * Filtering on `embeddingModel` (not vector length) is deliberate: two
 * different embedding models can coincidentally produce vectors of the same
 * length, so length alone can't reliably tell "already migrated" from "not
 * yet migrated." Provenance can.
 */
export const reembedBatchesWorker = internalAction({
  args: {
    cursor: v.union(v.string(), v.null()),
    processed: v.number(),
    errors: v.number(),
  },
  handler: async (ctx, args) => {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY environment variable not set");
    }

    const embeddingService = new EmbeddingService(openaiApiKey);

    const page = (await ctx.runQuery(internal._migration.reembedChunks.listDocumentChunksPage, {
      paginationOpts: { numItems: BATCH_SIZE, cursor: args.cursor },
    })) as {
      page: Array<Doc<"documentChunks"> & { embedding?: number[]; embeddingModel?: string }>;
      isDone: boolean;
      continueCursor: string;
    };

    let processed = args.processed;
    let errors = args.errors;

    const toUpdate = page.page.filter(
      (chunk: { embeddingModel?: string }) => chunk.embeddingModel !== EMBEDDING_MODEL
    );

    if (toUpdate.length > 0) {
      try {
        const texts = toUpdate.map((c: { content: string }) => c.content);
        const newEmbeddings = await embeddingService.embedBatch(texts);
        for (let j = 0; j < toUpdate.length; j++) {
          const chunk = toUpdate[j] as { _id: Id<"documentChunks"> };
          try {
            await ctx.runMutation(internal._migration.reembedChunks.updateChunkEmbedding, {
              chunkId: chunk._id,
              newEmbedding: newEmbeddings[j]!,
              embeddingModel: EMBEDDING_MODEL,
            });
            processed++;
          } catch (e) {
            console.error(`updateChunkEmbedding failed for ${chunk._id}:`, e);
            errors++;
          }
        }
      } catch (error) {
        console.error(`Batch embed failed at cursor ${args.cursor}:`, error);
        errors += toUpdate.length;
      }
    }

    if (!page.isDone) {
      // Avoid TS circular inference on self-scheduled action
      const continuation = internal._migration.reembedBatchesWorker
        .reembedBatchesWorker as typeof internal._migration.reembedBatchesWorker.reembedBatchesWorker;
      await ctx.scheduler.runAfter(0, continuation, {
        cursor: page.continueCursor,
        processed,
        errors,
      });
    } else {
      console.log(`reembedBatchesWorker complete: processed=${processed}, errors=${errors}`);
    }

    return {
      pageChunks: page.page.length,
      skippedInPage: page.page.length - toUpdate.length,
      isDone: page.isDone,
      processed,
      errors,
    };
  },
});

"use node";
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { FlashcardGraph } from '../../lib/services/agents/FlashcardGraph';
import { createCachedAction } from '../lib/cachedAgent';
import { CACHE_TTL } from '../lib/cache';
import { env } from '../../lib/helpers/env';

// ============================================================
// 1. Extract core generation logic into cacheable action
// ============================================================
export const generateFlashcardsInternal = internalAction({
  args: {
    chunks: v.array(v.string()),
    cardCount: v.number(),
    difficulty: v.string(),
    topic: v.optional(v.string()),
  },
  handler: async (ctx, { chunks, cardCount, difficulty, topic }) => {
    const agent = new FlashcardGraph(env.TOGETHER_AI_API_KEY, env.FAST_LLM, env.SMART_LLM);
    const graph = agent.buildGraph();
    const result = await graph.invoke({
      chunks,
      cardCount,
      difficulty,
      topic,
    });
    return result.finalOutput || [];
  },
});

// ============================================================
// 2. Create cached version with ActionCache
// ============================================================
const flashcardCache = createCachedAction(
  internal.jobs.FlashcardGenerationJob.generateFlashcardsInternal,
  { ttl: CACHE_TTL.agent, name: "flashcardV1" }
);

// ============================================================
// 3. Main job uses cached action
// ============================================================
export const flashcardGeneration = internalAction({
  args: {
    flashcardId: v.id('flashcards'),
    userId: v.string(),
    notebookId: v.id('notebooks'),
    documentIds: v.array(v.id('documents')),
    cardCount: v.number(),
    difficulty: v.string(),
    topic: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";

    const { flashcardId, userId, notebookId, documentIds, cardCount, difficulty, topic } = args;

    console.log('[FlashcardGenerationJob] Starting:', {
      flashcardId,
      cardCount,
      difficulty,
    });

    try {
      // Update status to generating - initial phase
      await ctx.runMutation(internal.jobs.helpers.updateFlashcardStatus, {
        flashcardId,
        status: 'generating',
        metadata: {
          phase: 'initializing',
          progress: 5,
          currentStep: 'Initializing...',
        },
      });

      // Update: Loading documents
      await ctx.runMutation(internal.jobs.helpers.updateFlashcardStatus, {
        flashcardId,
        status: 'generating',
        metadata: {
          phase: 'loading_documents',
          progress: 15,
          currentStep: 'Loading documents...',
        },
      });

      // Get document chunks (full objects from DB)
      const chunkObjects = await ctx.runAction(internal.documents.fetchChunks, {
        documentIds,
      });

      // Extract content strings for the agent (validator expects v.array(v.string()))
      const chunks = chunkObjects.map((chunk: { content: string }) => chunk.content);

      // Update: Analyzing content
      await ctx.runMutation(internal.jobs.helpers.updateFlashcardStatus, {
        flashcardId,
        status: 'generating',
        metadata: {
          phase: 'analyzing_content',
          progress: 30,
          currentStep: 'Analyzing content...',
        },
      });

      // Update: Generating flashcards
      await ctx.runMutation(internal.jobs.helpers.updateFlashcardStatus, {
        flashcardId,
        status: 'generating',
        metadata: {
          phase: 'generating_flashcards',
          progress: 50,
          currentStep: 'Generating flashcards...',
        },
      });

      // ============================================================
      // USE CACHED INVOCATION - This is where the magic happens
      // ============================================================
      const flashcards = (await flashcardCache.fetch(ctx, {
        chunks,
        cardCount,
        difficulty,
        topic,
      })) as any[];

      // Update: Finalizing
      await ctx.runMutation(internal.jobs.helpers.updateFlashcardStatus, {
        flashcardId,
        status: 'generating',
        metadata: {
          phase: 'finalizing',
          progress: 90,
          currentStep: 'Finalizing...',
        },
      });

      // Generate title from first chunk
      let title = 'Flashcards';
      if (chunks.length > 0) {
        try {
          title = await ctx.runAction(internal.titleGenerator.generateTitle, {
            chunk: chunks[0],
          });
        } catch (error) {
          console.error('[FlashcardGenerationJob] Title generation failed:', error);
          // Fall back to default title
          title = 'Flashcards';
        }
      }

      // Save results
      await ctx.runMutation(internal.jobs.helpers.saveFlashcardResults, {
        flashcardId,
        flashcards,
        metadata: {
          title,
          cardCount: flashcards.length,
          phase: 'completed',
          progress: 100,
          completedAt: Date.now(),
        },
      });

      console.log('[FlashcardGenerationJob] Completed:', {
        flashcardId,
        cardCount: flashcards.length,
      });
    } catch (error) {
      console.error('[FlashcardGenerationJob] Error:', error);

      // Mark as failed
      await ctx.runMutation(internal.jobs.helpers.markFlashcardFailed, {
        flashcardId,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          phase: 'failed',
          progress: 0,
          failedAt: Date.now(),
        },
      });

      throw error;
    }
  },
});

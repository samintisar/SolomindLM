"use node";
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { QuizGraph } from '../../lib/services/agents/QuizGraph';
import { createCachedAction } from '../lib/cachedAgent';
import { CACHE_TTL } from '../lib/cache';
import { env } from '../../lib/helpers/env';

// ============================================================
// 1. Extract core generation logic into cacheable action
// ============================================================
export const generateQuizInternal = internalAction({
  args: {
    chunks: v.array(v.string()),
    questionCount: v.number(),
    difficulty: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, { chunks, questionCount, difficulty, focus }) => {
    const agent = new QuizGraph(env.TOGETHER_AI_API_KEY, env.FAST_LLM, env.SMART_LLM);
    const graph = agent.buildGraph();
    const result = await graph.invoke({
      chunks,
      questionCount,
      difficulty,
      focus,
    });
    return result.finalOutput || [];
  },
});

// ============================================================
// 2. Create cached version with ActionCache
// ============================================================
const quizCache = createCachedAction(
  internal.jobs.QuizGenerationJob.generateQuizInternal,
  { ttl: CACHE_TTL.agent, name: "quizV1" }
);

// ============================================================
// 3. Main job uses cached action
// ============================================================
export const quizGeneration = internalAction({
  args: {
    quizId: v.id('quizzes'),
    userId: v.string(),
    notebookId: v.id('notebooks'),
    documentIds: v.array(v.id('documents')),
    questionCount: v.number(),
    difficulty: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";

    const { quizId, userId, notebookId, documentIds, questionCount, difficulty, focus } = args;

    console.log('[QuizGenerationJob] Starting:', {
      quizId,
      questionCount,
      difficulty,
      focus,
    });

    try {
      // Update status to generating
      await ctx.runMutation(internal.jobs.helpers.updateQuizStatus, {
        quizId,
        status: 'generating',
        metadata: { phase: 'initializing' },
      });

      // Get document chunks (full objects from DB)
      const chunkObjects = await ctx.runAction(internal.documents.fetchChunks, {
        documentIds,
      });

      // Extract content strings for the agent (validator expects v.array(v.string()))
      const chunks = chunkObjects.map((chunk: { content: string }) => chunk.content);

      // ============================================================
      // USE CACHED INVOCATION - This is where the magic happens
      // ============================================================
      const questions = (await quizCache.fetch(ctx, {
        chunks,
        questionCount,
        difficulty,
        focus,
      })) as any[];

      // Generate title from first chunk content (title generator expects v.string())
      let title = 'Quiz';
      if (chunks.length > 0) {
        try {
          title = await ctx.runAction(internal.titleGenerator.generateTitle, {
            chunk: chunks[0],
          });
        } catch (error) {
          console.error('[QuizGenerationJob] Title generation failed:', error);
          // Fall back to default title
          title = 'Quiz';
        }
      }

      // Save results
      await ctx.runMutation(internal.jobs.helpers.saveQuizResults, {
        quizId,
        questions,
        metadata: {
          title,
          questionCount: questions.length,
          phase: 'completed',
          completedAt: Date.now(),
        },
      });

      console.log('[QuizGenerationJob] Completed:', {
        quizId,
        questionCount: questions.length,
      });
    } catch (error) {
      console.error('[QuizGenerationJob] Error:', error);

      // Mark as failed
      await ctx.runMutation(internal.jobs.helpers.markQuizFailed, {
        quizId,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          phase: 'failed',
          failedAt: Date.now(),
        },
      });

      throw error;
    }
  },
});

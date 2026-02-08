"use node";
import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { WrittenQuestionsGraph } from '../lib/agents/WrittenQuestionsGraph';
import { createCachedAction } from '../lib/cachedAgent';
import { CACHE_TTL } from '../lib/cache';
import { env } from '../lib/helpers/env';

// ============================================================
// 1. Extract core generation logic into cacheable action
// ============================================================
export const generateWrittenQuestionsInternal = internalAction({
  args: {
    chunks: v.array(v.string()),
    questionCount: v.number(),
    difficulty: v.string(),
    questionType: v.string(),
    focus: v.optional(v.string()),
    status: v.string(),
  },
  handler: async (ctx, { chunks, questionCount, difficulty, questionType, focus, status }) => {
    const agent = new WrittenQuestionsGraph(env.TOGETHER_AI_API_KEY, env.FAST_LLM, env.SMART_LLM);
    const graph = agent.buildGraph();
    const result = await graph.invoke({
      chunks,
      questionCount,
      difficulty,
      questionType: (questionType === "short" || questionType === "essay") ? questionType : "short",
      focus,
      status,
    });
    return result.finalOutput || [];
  },
});

// ============================================================
// 2. Create cached version with ActionCache
// ============================================================
const writtenQuestionsCache = createCachedAction(
  internal.jobs.WrittenQuestionsGenerationJob.generateWrittenQuestionsInternal,
  { ttl: CACHE_TTL.agent, name: "writtenQuestionsV1" }
);

// ============================================================
// 3. Main job uses cached action
// ============================================================
export const writtenQuestionsGeneration = internalAction({
  args: {
    writtenQuestionId: v.id('writtenQuestions'),
    userId: v.string(),
    notebookId: v.id('notebooks'),
    documentIds: v.array(v.id('documents')),
    questionCount: v.number(),
    difficulty: v.string(),
    questionType: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";

    const { writtenQuestionId, userId, notebookId, documentIds, questionCount, difficulty, questionType, focus } = args;

    console.log('[WrittenQuestionsGenerationJob] Starting:', {
      writtenQuestionId,
      questionCount,
      difficulty,
      questionType,
      focus,
    });

    try {
      // Update status to generating
      await ctx.runMutation(internal.jobs.helpers.updateWrittenQuestionsStatus, {
        writtenQuestionId,
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
      const questions = (await writtenQuestionsCache.fetch(ctx, {
        chunks,
        questionCount,
        difficulty,
        questionType: (questionType === "short" || questionType === "essay") ? questionType : "short",
        focus,
        status: "generating",
      })) as any[];

      // Generate title from first chunk
      let title = 'Written Questions';
      if (chunks.length > 0) {
        try {
          title = await ctx.runAction(internal.titleGenerator.generateTitle, {
            chunk: chunks[0],
          });
        } catch (error) {
          console.error('[WrittenQuestionsGenerationJob] Title generation failed:', error);
          // Fall back to default title
          title = 'Written Questions';
        }
      }

      // Save results
      await ctx.runMutation(internal.jobs.helpers.saveWrittenQuestionsResults, {
        writtenQuestionId,
        questions,
        metadata: {
          title,
          questionCount: questions.length,
          phase: 'completed',
          completedAt: Date.now(),
        },
      });

      console.log('[WrittenQuestionsGenerationJob] Completed:', {
        writtenQuestionId,
        questionCount: questions.length,
      });
    } catch (error) {
      console.error('[WrittenQuestionsGenerationJob] Error:', error);

      // Mark as failed
      await ctx.runMutation(internal.jobs.helpers.markWrittenQuestionsFailed, {
        writtenQuestionId,
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

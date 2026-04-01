"use node";
/**
 * WrittenQuestionsGenerationJob - Multi-Phase Architecture
 *
 * Breaks written question generation into separate scheduled actions to avoid
 * Cloudflare 524 timeouts. Each phase runs in its own action with
 * its own timeout window.
 *
 * Phases:
 * 1. writtenQuestionsGeneration (entry) - Load docs, pack chunks, schedule map tasks
 * 2. processWrittenQuestionsMapChunk - Generate questions from one chunk (parallel)
 * 3. finalizeWrittenQuestionsPhase - Collect and select best questions, save output
 */

import { internalAction } from '../../_generated/server';
import { v } from 'convex/values';
import { internal } from '../../_generated/api';
import { packChunks, validateChunks } from '../../_agents/WrittenQuestionsGraph';
import { env } from '../../_lib/env';
import {
  createJobLogger,
  createErrorMetadata,
} from '../../_agents/_shared/logging';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import {
  getMapPrompt,
  WrittenQuestionsArraySchema,
  MAP_SYSTEM_PROMPT,
  REDUCE_SELECT_SYSTEM_PROMPT,
  type WrittenQuestion,
  type WrittenQuestionsResponse,
} from '../../_agents/written_questions/prompts';
import {
  applySelectedQuestionIds,
  dedupeQuestions,
  getSelectionIdsPrompt,
} from '../../_agents/written_questions/postprocess';
import {
  invokeWithTimeout,
  invokeWithRetry,
  sanitizeUserInput,
  createLangSmithRunConfig,
} from '../../_agents/_shared/index';

// ============================================================
// SCHEMAS
// ============================================================

// Interface for the structured LLM to avoid deep type instantiation
interface WrittenQuestionsOutputInvoker {
  invoke(messages: Array<SystemMessage | HumanMessage>, config?: any): Promise<WrittenQuestionsResponse>;
}

// Helper function to create a structured LLM without triggering deep type instantiation
function createQuestionsLLM(llm: ChatTogetherAI): WrittenQuestionsOutputInvoker {
  // @ts-ignore - Type instantiation is excessively deep with LangChain's withStructuredOutput
  return llm.withStructuredOutput(WrittenQuestionsArraySchema, {
    name: 'written_questions',
  });
}

const WrittenQuestionIdSelectionSchema = z.object({
  selectedIds: z.array(z.string()),
});

type WrittenQuestionIdSelectionResponse = z.infer<typeof WrittenQuestionIdSelectionSchema>;

interface WrittenQuestionSelectionInvoker {
  invoke(messages: Array<SystemMessage | HumanMessage>, config?: any): Promise<WrittenQuestionIdSelectionResponse>;
}

function createQuestionSelectionLLM(llm: ChatTogetherAI): WrittenQuestionSelectionInvoker {
  // @ts-ignore - Type instantiation is excessively deep with LangChain's withStructuredOutput
  return llm.withStructuredOutput(WrittenQuestionIdSelectionSchema, {
    name: 'written_question_id_selection',
  });
}

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.WRITTEN_QUESTIONS_MAP_CHUNK_TOKENS || '10000', 10),
  PER_CHUNK_TIMEOUT_MS: 90000, // 90 seconds per chunk (under 100s Cloudflare limit)
  REDUCE_TIMEOUT_MS: 120000, // 120 seconds for reduce
  MIN_QUESTIONS_PER_CHUNK: parseInt(env.WRITTEN_QUESTIONS_MIN_QUESTIONS_PER_CHUNK || '2', 10),
  MAX_QUESTIONS_PER_CHUNK: parseInt(env.WRITTEN_QUESTIONS_MAX_QUESTIONS_PER_CHUNK || '10', 10),
  BUFFER_MULTIPLIER: 1.5,
} as const;

// ============================================================
// HELPER: Create structured LLM for map phase
// ============================================================

function createMapLLM(): ChatTogetherAI {
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model: env.FAST_LLM,
    temperature: 0.4,
    timeout: CONFIG.PER_CHUNK_TIMEOUT_MS,
    modelKwargs: { chat_template_kwargs: { thinking: false } },
    maxTokens: 8000,
  });
}

function createReduceLLM(): ChatTogetherAI {
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model: env.SMART_LLM,
    temperature: 0.3,
    timeout: CONFIG.REDUCE_TIMEOUT_MS,
    maxTokens: parseInt(env.WRITTEN_QUESTIONS_REDUCE_MAX_TOKENS || '32000', 10),
  });
}

// ============================================================
// PHASE 1: Initialize & Schedule Map Tasks
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

    // Initialize structured logger
    const logger = createJobLogger({
      jobType: 'written_questions',
      jobId: writtenQuestionId,
      notebookId,
      userId,
    });

    logger.jobStart({
      questionCount,
      difficulty,
      questionType,
      focus,
      docCount: documentIds.length,
    });

    try {
      // Phase: Initializing
      logger.phaseStart('initializing', { progress: 5 });
      await ctx.runMutation(internal.studio._helpers.updateWrittenQuestionsStatus, {
        writtenQuestionId,
        status: 'generating',
        metadata: {
          phase: 'initializing',
          progress: 5,
          currentStep: 'Initializing...',
        },
      });
      logger.phaseComplete('initializing');

      // Phase: Loading documents
      logger.phaseStart('loading_documents', { progress: 15, docCount: documentIds.length });
      await ctx.runMutation(internal.studio._helpers.updateWrittenQuestionsStatus, {
        writtenQuestionId,
        status: 'generating',
        metadata: {
          phase: 'loading_documents',
          progress: 15,
          currentStep: 'Loading documents...',
        },
      });

      // Get document chunks
      const chunkObjects = await ctx.runAction(internal.documents.index.fetchChunks, {
        documentIds,
      });

      // Extract content from chunk objects
      const rawChunks = chunkObjects.map((chunk: any) => chunk.content);

      logger.phaseComplete('loading_documents', { chunkCount: rawChunks.length });

      // Validate and pack chunks
      const validatedChunks = validateChunks(rawChunks);
      const packedChunks = packChunks(validatedChunks, CONFIG.MAP_CHUNK_SIZE_TOKENS);

      console.log(`[WrittenQuestionsJob] Packed ${rawChunks.length} chunks into ${packedChunks.length} map tasks`);

      if (packedChunks.length === 0) {
        throw new Error('No valid chunks to process');
      }

      // Calculate questions per chunk
      const questionsPerChunk = Math.max(
        CONFIG.MIN_QUESTIONS_PER_CHUNK,
        Math.min(
          CONFIG.MAX_QUESTIONS_PER_CHUNK,
          Math.ceil(questionCount / packedChunks.length * CONFIG.BUFFER_MULTIPLIER)
        )
      );

      console.log(`[WrittenQuestionsJob] Questions per chunk: ${questionsPerChunk}`);

      // Initialize map phase metadata
      await ctx.runMutation(internal.studio._helpers.initWrittenQuestionsMapPhase, {
        writtenQuestionId,
        totalMapTasks: packedChunks.length,
        questionCount,
        difficulty,
        questionType: (questionType === 'short' || questionType === 'essay') ? questionType : 'short',
        focus,
      });

      // Schedule each map task as a separate action
      for (let i = 0; i < packedChunks.length; i++) {
        await ctx.scheduler.runAfter(0, internal.studio.writtenQuestions.job.processWrittenQuestionsMapChunk, {
          writtenQuestionId,
          userId,
          notebookId,
          chunkIndex: i,
          totalChunks: packedChunks.length,
          chunk: packedChunks[i],
          questionCount,
          questionsPerChunk,
          difficulty,
          questionType: (questionType === 'short' || questionType === 'essay') ? questionType : 'short',
          focus,
        });
        console.log(`[WrittenQuestionsJob] Scheduled map task ${i + 1}/${packedChunks.length}`);
      }

      logger.info('Map phase initialized', {
        totalMapTasks: packedChunks.length,
        chunkSizes: packedChunks.map(c => c.length),
        questionsPerChunk,
      });

    } catch (error) {
      const errorMeta = createErrorMetadata(error, 'initializing');

      logger.jobError(error, {
        phase: 'initializing',
        errorType: errorMeta.type,
        retryable: errorMeta.retryable,
      });

      await ctx.runMutation(internal.studio._helpers.markWrittenQuestionsFailed, {
        writtenQuestionId,
        error: errorMeta.message,
        metadata: {
          phase: 'failed',
          progress: 0,
          failedAt: Date.now(),
          errorPhase: 'initializing',
          errorType: errorMeta.type,
          retryable: errorMeta.retryable,
          stack: errorMeta.stackTrace,
        },
      });

      throw error;
    }
  },
});

// ============================================================
// PHASE 2: Process Individual Map Chunk
// ============================================================

export const processWrittenQuestionsMapChunk = internalAction({
  args: {
    writtenQuestionId: v.id('writtenQuestions'),
    userId: v.string(),
    notebookId: v.id('notebooks'),
    chunkIndex: v.number(),
    totalChunks: v.number(),
    chunk: v.string(),
    questionCount: v.number(),
    questionsPerChunk: v.number(),
    difficulty: v.string(),
    questionType: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";

    const { writtenQuestionId, userId, notebookId, chunkIndex, totalChunks, chunk, questionCount, questionsPerChunk, difficulty, questionType, focus } = args;

    const logger = createJobLogger({
      jobType: 'written_questions',
      jobId: writtenQuestionId,
      notebookId,
      userId,
    });

    const chunkId = `[Chunk ${chunkIndex + 1}/${totalChunks}]`;
    console.log(`[WrittenQuestionsJob] ${chunkId} Starting map processing`);

    try {
      // Check if written questions still exists
      const writtenQuestion = await ctx.runQuery(internal.studio.writtenQuestions.index.getInternal, { id: writtenQuestionId });
      if (!writtenQuestion) {
        console.log(`[WrittenQuestionsJob] ${chunkId} Written questions deleted, skipping`);
        return;
      }

      // Process with LLM using structured output
      const llm = createMapLLM();
      const structuredLLM = createQuestionsLLM(llm);

      const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;
      const prompt = getMapPrompt({
        chunk,
        questionCount,
        questionsPerChunk,
        difficulty,
        questionType,
        focus: sanitizedFocus,
      });

      console.log(`[WrittenQuestionsJob] ${chunkId} Calling LLM (${prompt.length} chars)`);

      const startTime = Date.now();
      const response = await invokeWithRetry(
        () => invokeWithTimeout(
          () => (structuredLLM as any).invoke([
            new SystemMessage(MAP_SYSTEM_PROMPT),
            new HumanMessage(prompt),
          ], createLangSmithRunConfig({
            runName: 'WrittenQuestionsJob.MapProcess',
            tags: ['agent', 'written_questions', 'map'],
            metadata: {
              chunkIndex,
              questionsPerChunk,
              difficulty,
              questionType,
            },
          })),
          CONFIG.PER_CHUNK_TIMEOUT_MS,
          'WrittenQuestionsMap'
        ),
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          onRetry: (attempt, error) => {
            console.log(`[WrittenQuestionsJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`);
          },
        },
        'WrittenQuestionsMap'
      );

      const elapsed = Date.now() - startTime;
      console.log(`[WrittenQuestionsJob] ${chunkId} LLM completed in ${elapsed}ms`);

      // Store result
      const questions = (response as WrittenQuestionsResponse).questions;
      const result = {
        questions,
        processingTimeMs: elapsed,
      };

      await ctx.runMutation(internal.studio._helpers.storeWrittenQuestionsMapResult, {
        writtenQuestionId,
        chunkIndex,
        result: JSON.stringify(result),
      });

      logger.info(`Map chunk completed`, {
        chunkIndex,
        elapsed,
        questionsGenerated: questions.length,
      });

      // Check if all maps are complete
      const updatedWrittenQuestion = await ctx.runQuery(internal.studio.writtenQuestions.index.getInternal, { id: writtenQuestionId });
      if (!updatedWrittenQuestion) return;

      const completedMaps = updatedWrittenQuestion.metadata?.mapResults
        ? Object.keys(updatedWrittenQuestion.metadata.mapResults).length
        : 0;
      const totalMaps = updatedWrittenQuestion.metadata?.totalMapTasks || totalChunks;

      console.log(`[WrittenQuestionsJob] Map progress: ${completedMaps}/${totalMaps}`);

      if (completedMaps >= totalMaps) {
        console.log(`[WrittenQuestionsJob] All map tasks complete, scheduling finalization`);
        await ctx.scheduler.runAfter(0, internal.studio.writtenQuestions.job.finalizeWrittenQuestionsPhase, {
          writtenQuestionId,
          userId,
          notebookId,
          questionCount,
          difficulty,
          questionType,
          focus,
        });
      }

    } catch (error) {
      const errorMeta = createErrorMetadata(error, 'map_processing');

      console.error(`[WrittenQuestionsJob] ${chunkId} FAILED:`, errorMeta.message);

      // Store error result
      await ctx.runMutation(internal.studio._helpers.storeWrittenQuestionsMapResult, {
        writtenQuestionId,
        chunkIndex,
        result: JSON.stringify({
          _error: true,
          errorMessage: errorMeta.message,
          isTimeout: errorMeta.type === 'llm_timeout',
          questions: [],
        }),
      });

      logger.warn(`Map chunk failed`, {
        chunkIndex,
        error: errorMeta.message,
        errorType: errorMeta.type,
      });

      // Check if we should still proceed with partial results
      const writtenQuestion = await ctx.runQuery(internal.studio.writtenQuestions.index.getInternal, { id: writtenQuestionId });
      if (!writtenQuestion) return;

      const completedMaps = writtenQuestion.metadata?.mapResults
        ? Object.keys(writtenQuestion.metadata.mapResults).length
        : 0;
      const totalMaps = writtenQuestion.metadata?.totalMapTasks || totalChunks;
      const failedMaps = writtenQuestion.metadata?.mapResults
        ? Object.values(writtenQuestion.metadata.mapResults).filter(
          (r: any) => {
            try {
              const parsed = JSON.parse(r as string);
              return parsed._error;
            } catch {
              return false;
            }
          }
        ).length
        : 0;

      if (completedMaps >= totalMaps) {
        const successCount = totalMaps - failedMaps;
        console.log(`[WrittenQuestionsJob] All tasks done. Success: ${successCount}/${totalMaps}`);

        if (successCount > 0) {
          await ctx.scheduler.runAfter(0, internal.studio.writtenQuestions.job.finalizeWrittenQuestionsPhase, {
            writtenQuestionId,
            userId,
            notebookId,
            questionCount,
            difficulty,
            questionType,
            focus,
          });
        } else {
          await ctx.runMutation(internal.studio._helpers.markWrittenQuestionsFailed, {
            writtenQuestionId,
            error: 'All map tasks failed',
            metadata: {
              phase: 'failed',
              errorPhase: 'map_processing',
              errorType: 'llm_failure',
              failedAt: Date.now(),
            },
          });
        }
      }
    }
  },
});

// ============================================================
// PHASE 3: Finalize (Collect + Select + Save)
// ============================================================

export const finalizeWrittenQuestionsPhase = internalAction({
  args: {
    writtenQuestionId: v.id('writtenQuestions'),
    userId: v.string(),
    notebookId: v.id('notebooks'),
    questionCount: v.number(),
    difficulty: v.string(),
    questionType: v.string(),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";

    const { writtenQuestionId, userId, notebookId, questionCount, difficulty, questionType, focus } = args;

    const logger = createJobLogger({
      jobType: 'written_questions',
      jobId: writtenQuestionId,
      notebookId,
      userId,
    });

    logger.info('Starting finalization phase');

    try {
      // Get written questions with map results
      const writtenQuestion = await ctx.runQuery(internal.studio.writtenQuestions.index.getInternal, { id: writtenQuestionId });
      if (!writtenQuestion) {
        console.log('[WrittenQuestionsJob] Written questions deleted during finalization');
        return;
      }

      const mapResults = writtenQuestion.metadata?.mapResults as Record<string, string> || {};

      // Separate successful and failed results
      const allQuestions: WrittenQuestion[] = [];
      const failedCount = { count: 0 };

      for (const [idx, resultJson] of Object.entries(mapResults)) {
        try {
          const parsed = JSON.parse(resultJson);
          if (parsed._error) {
            failedCount.count++;
          } else if (parsed.questions && Array.isArray(parsed.questions)) {
            allQuestions.push(...parsed.questions);
          }
        } catch {
          failedCount.count++;
        }
      }

      console.log(`[WrittenQuestionsJob] Finalization: ${allQuestions.length} questions collected, ${failedCount.count} failed chunks`);

      if (allQuestions.length === 0) {
        throw new Error('No successful questions generated from any chunk');
      }

      // Update status for selection
      await ctx.runMutation(internal.studio._helpers.updateWrittenQuestionsStatus, {
        writtenQuestionId,
        status: 'generating',
        metadata: {
          phase: 'selecting',
          progress: 70,
          currentStep: 'Selecting best questions...',
        },
      });

      const dedupedQuestions = dedupeQuestions(allQuestions);
      console.log(`[WrittenQuestionsJob] ${allQuestions.length} questions collapsed to ${dedupedQuestions.length} after heuristic dedupe`);

      let finalQuestions: WrittenQuestion[];

      if (dedupedQuestions.length > questionCount) {
        console.log(`[WrittenQuestionsJob] Selecting ${questionCount} best questions from ${dedupedQuestions.length} deduped candidates`);

        const reduceLLM = createReduceLLM();
        const structuredSelectLLM = createQuestionSelectionLLM(reduceLLM);
        const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;
        const selectionPrompt = getSelectionIdsPrompt({
          questions: dedupedQuestions,
          targetCount: questionCount,
          difficulty,
          questionType,
          focus: sanitizedFocus,
        });

        console.log(`[WrittenQuestionsJob] Selection prompt: ${selectionPrompt.length} chars`);

        const startTime = Date.now();
        const selectionResponse = await invokeWithRetry(
          () => invokeWithTimeout(
            () => structuredSelectLLM.invoke([
              new SystemMessage(REDUCE_SELECT_SYSTEM_PROMPT),
              new HumanMessage(selectionPrompt),
            ], createLangSmithRunConfig({
              runName: 'WrittenQuestionsJob.Select',
              tags: ['agent', 'written_questions', 'select'],
              metadata: {
                inputQuestions: dedupedQuestions.length,
                targetCount: questionCount,
                difficulty,
                questionType,
                focus: sanitizedFocus || 'none',
              },
            })),
            CONFIG.REDUCE_TIMEOUT_MS,
            'WrittenQuestionsSelect'
          ),
          {
            maxAttempts: 2,
            baseDelayMs: 1000,
          },
          'WrittenQuestionsSelect'
        );

        finalQuestions = applySelectedQuestionIds(
          dedupedQuestions,
          selectionResponse.selectedIds,
          questionCount,
        );

        if (finalQuestions.length === 0) {
          throw new Error('LLM returned zero valid selected question IDs');
        }

        console.log(`[WrittenQuestionsJob] Selection completed in ${Date.now() - startTime}ms, selected ${finalQuestions.length} questions`);
      } else {
        finalQuestions = dedupedQuestions;
        console.log(`[WrittenQuestionsJob] Using all ${finalQuestions.length} deduped questions (within limit)`);
      }

      // Update status for finalizing
      await ctx.runMutation(internal.studio._helpers.updateWrittenQuestionsStatus, {
        writtenQuestionId,
        status: 'generating',
        metadata: {
          phase: 'finalizing',
          progress: 90,
          currentStep: 'Saving results...',
        },
      });

      // Generate title
      let title = 'Written Questions';
      if (finalQuestions.length > 0) {
        try {
          const titleContent = finalQuestions.map(q => q.question).join(' ').substring(0, 2000);
          title = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
            chunk: titleContent,
          });
        } catch (e) {
          console.log('[WrittenQuestionsJob] Title generation failed, using default');
        }
      }

      // Save results
      await ctx.runMutation(internal.studio._helpers.saveWrittenQuestionsResults, {
        writtenQuestionId,
        questions: finalQuestions,
        metadata: {
          title,
          questionCount: finalQuestions.length,
          phase: 'completed',
          progress: 100,
          completedAt: Date.now(),
          mapSuccessCount: Object.keys(mapResults).length - failedCount.count,
          mapFailedCount: failedCount.count,
        },
      });

      // Clear intermediate data
      await ctx.runMutation(internal.studio._helpers.clearWrittenQuestionsMapData, { writtenQuestionId });

      logger.jobComplete({
        questionsGenerated: finalQuestions.length,
        title,
        mapSuccess: Object.keys(mapResults).length - failedCount.count,
        mapFailed: failedCount.count,
      });

    } catch (error) {
      const errorMeta = createErrorMetadata(error, 'finalization');

      logger.jobError(error, {
        phase: 'finalization',
        errorType: errorMeta.type,
        retryable: errorMeta.retryable,
      });

      await ctx.runMutation(internal.studio._helpers.markWrittenQuestionsFailed, {
        writtenQuestionId,
        error: errorMeta.message,
        metadata: {
          phase: 'failed',
          errorPhase: 'finalization',
          errorType: errorMeta.type,
          retryable: errorMeta.retryable,
          failedAt: Date.now(),
        },
      });

      throw error;
    }
  },
});

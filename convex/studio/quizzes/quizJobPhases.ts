"use node";
/**
 * Quiz generation — phase logic.
 * @see ./job.ts for Convex `internalAction` registrations.
 */

import type { ActionCtx } from '../../_generated/server';
import type { Id } from '../../_generated/dataModel';
import { internal } from '../../_generated/api';
import { packChunks, validateChunks } from '../../_agents/QuizGraph';
import { env } from '../../_lib/env';
import {
  createJobLogger,
  createErrorMetadata,
} from '../../_agents/_shared/logging';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import {
  getCandidateMapPrompt,
  getCandidateSelectionPrompt,
  getExpandPrompt,
  QuizCandidateArraySchema,
  QuizQuestionArraySchema,
  QuizQuestionSchema,
  type QuizCandidate,
  type QuizCandidateResponse,
  type QuizQuestion,
  type QuizQuestionResponse,
  MAP_CANDIDATES_SYSTEM_PROMPT,
  REDUCE_SELECT_SYSTEM_PROMPT,
  EXPAND_QUESTION_SYSTEM_PROMPT,
} from '../../_agents/quiz/prompts';
import { sanitizeUserInput, allWithConcurrency } from '../../_agents/_shared/index';
import { invokeStudioLlm, createLangSmithRunConfig } from '../_job/invokeStudioLlm';

// Interface for the structured LLM to avoid deep type instantiation
interface QuizCandidateOutputInvoker {
  invoke(messages: Array<SystemMessage | HumanMessage>, config?: any): Promise<QuizCandidateResponse>;
}

interface QuizQuestionOutputInvoker {
  invoke(messages: Array<SystemMessage | HumanMessage>, config?: any): Promise<QuizQuestion>;
}

// Helper function to create a structured LLM without triggering deep type instantiation
function createCandidateLLM(llm: ChatTogetherAI): QuizCandidateOutputInvoker {
  // @ts-ignore - Type instantiation is excessively deep with LangChain's withStructuredOutput
  return llm.withStructuredOutput(QuizCandidateArraySchema, {
    name: 'quiz_candidates',
  });
}

function createQuestionLLM(llm: ChatTogetherAI): QuizQuestionOutputInvoker {
  // @ts-ignore - Type instantiation is excessively deep with LangChain's withStructuredOutput
  return llm.withStructuredOutput(QuizQuestionSchema, {
    name: 'quiz_question',
  });
}

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.QUIZ_MAP_CHUNK_TOKENS || '2500', 10),
  PER_CHUNK_TIMEOUT_MS: 90000, // 90 seconds per chunk (under 100s Cloudflare limit)
  REDUCE_TIMEOUT_MS: 120000, // 120 seconds for reduce (selection + expansion)
  EXPAND_TIMEOUT_MS: 60000, // 60 seconds per question expansion
  MIN_QUESTIONS_PER_CHUNK: 2,
  MAX_QUESTIONS_PER_CHUNK: 20,
  BUFFER_MULTIPLIER: 1.2,
  EXPAND_CONCURRENCY: 5,
} as const;

export type QuizGenerationPhaseArgs = {
  quizId: Id<'quizzes'>;
  userId: string;
  notebookId: Id<'notebooks'>;
  documentIds: Id<'documents'>[];
  questionCount: number;
  difficulty: string;
  focus?: string;
};

export type ProcessQuizMapChunkPhaseArgs = {
  quizId: Id<'quizzes'>;
  userId: string;
  notebookId: Id<'notebooks'>;
  chunkIndex: number;
  totalChunks: number;
  chunk: string;
  questionCount: number;
  questionsPerChunk: number;
  difficulty: string;
  focus?: string;
};

export type FinalizeQuizPhaseArgs = {
  quizId: Id<'quizzes'>;
  userId: string;
  notebookId: Id<'notebooks'>;
  questionCount: number;
  difficulty: string;
  focus?: string;
};

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
    // Increased from 8000 to handle large chunks (19-22K chars = ~6-8K input tokens)
    // Need room for 8 candidates × ~300 tokens each = ~2400 output tokens
    // Total: ~6K input + ~2.4K output + ~1K prompt = ~10K tokens minimum
    maxTokens: parseInt(env.QUIZ_MAX_TOKENS || '16000', 10),
  });
}

function createReduceLLM(): ChatTogetherAI {
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model: env.SMART_LLM,
    temperature: 0.3,
    timeout: CONFIG.REDUCE_TIMEOUT_MS,
    maxTokens: parseInt(env.QUIZ_REDUCE_MAX_TOKENS || '24000', 10),
  });
}

function createExpandLLM(): ChatTogetherAI {
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model: env.SMART_LLM,
    temperature: 0.3,
    timeout: CONFIG.EXPAND_TIMEOUT_MS,
    maxTokens: parseInt(env.QUIZ_EXPAND_MAX_TOKENS || '4096', 10),
  });
}

// ============================================================
// PHASE 1: Initialize & Schedule Map Tasks
// ============================================================

export async function runQuizGenerationPhase(
  ctx: ActionCtx,
  args: QuizGenerationPhaseArgs,
): Promise<void> {
    "use node";

    const { quizId, userId, notebookId, documentIds, questionCount, difficulty, focus } = args;

    // Initialize structured logger
    const logger = createJobLogger({
      jobType: 'quiz',
      jobId: quizId,
      notebookId,
      userId,
    });

    logger.jobStart({
      questionCount,
      difficulty,
      focus,
      docCount: documentIds.length,
    });

    try {
      // Phase: Initializing
      logger.phaseStart('initializing', { progress: 5 });
      await ctx.runMutation(internal.studio.jobMutations.quizzes.updateQuizStatus, {
        quizId,
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
      await ctx.runMutation(internal.studio.jobMutations.quizzes.updateQuizStatus, {
        quizId,
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

      console.log(`[QuizJob] Packed ${rawChunks.length} chunks into ${packedChunks.length} map tasks`);

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

      console.log(`[QuizJob] Questions per chunk: ${questionsPerChunk}`);

      // Initialize map phase metadata
      await ctx.runMutation(internal.studio.jobMutations.quizzes.initQuizMapPhase, {
        quizId,
        totalMapTasks: packedChunks.length,
        questionCount,
        difficulty,
        focus,
      });

      // Schedule each map task as a separate action
      for (let i = 0; i < packedChunks.length; i++) {
        await ctx.scheduler.runAfter(0, internal.studio.quizzes.job.processQuizMapChunk, {
          quizId,
          userId,
          notebookId,
          chunkIndex: i,
          totalChunks: packedChunks.length,
          chunk: packedChunks[i],
          questionCount,
          questionsPerChunk,
          difficulty,
          focus,
        });
        console.log(`[QuizJob] Scheduled map task ${i + 1}/${packedChunks.length}`);
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

      await ctx.runMutation(internal.studio.jobMutations.quizzes.markQuizFailed, {
        quizId,
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
}

// ============================================================
// PHASE 2: Process Individual Map Chunk
// ============================================================

export async function runProcessQuizMapChunkPhase(
  ctx: ActionCtx,
  args: ProcessQuizMapChunkPhaseArgs,
): Promise<void> {
  "use node";

  const { quizId, userId, notebookId, chunkIndex, totalChunks, chunk, questionCount, questionsPerChunk, difficulty, focus } = args;

  const logger = createJobLogger({
    jobType: 'quiz',
    jobId: quizId,
    notebookId,
    userId,
  });

  const chunkId = `[Chunk ${chunkIndex + 1}/${totalChunks}]`;
  console.log(`[QuizJob] ${chunkId} Starting map processing`);

  try {
    // Check if quiz still exists
    const quiz = await ctx.runQuery(internal.studio.quizzes.index.getInternal, { id: quizId });
    if (!quiz) {
      console.log(`[QuizJob] ${chunkId} Quiz deleted, skipping`);
      return;
    }

    // Process with LLM using structured output
    const llm = createMapLLM();
    const structuredLLM = createCandidateLLM(llm);

    const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;
    const prompt = getCandidateMapPrompt({ chunk, questionCount, questionsPerChunk, difficulty, focus: sanitizedFocus });

    // DIAGNOSTIC: Log chunk info and prompt preview
    console.log(`[QuizJob] ${chunkId} Calling LLM (${prompt.length} chars)`);
    console.log(`[QuizJob] ${chunkId} Chunk preview: ${chunk.substring(0, 200)}...`);
    console.log(`[QuizJob] ${chunkId} Target questions: ${questionsPerChunk}, Difficulty: ${difficulty}`);

    const startTime = Date.now();
    let response;
    try {
      response = await invokeStudioLlm({
        invoke: () =>
          (structuredLLM as any).invoke(
            [new SystemMessage(MAP_CANDIDATES_SYSTEM_PROMPT), new HumanMessage(prompt)],
            createLangSmithRunConfig({
              runName: 'QuizJob.MapCandidates',
              tags: ['agent', 'quiz', 'map'],
              metadata: {
                chunkIndex,
                questionCount,
                difficulty,
                focus: focus || 'none',
              },
            })
          ),
        timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
        phaseLabel: 'QuizMap',
        onRetry: (attempt, error) => {
          console.log(`[QuizJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`);
        },
      });
    } catch (error) {
      console.log(`[QuizJob] ${chunkId} LLM invocation failed: ${error}`);
      throw error;
    }

    const elapsed = Date.now() - startTime;
    console.log(`[QuizJob] ${chunkId} LLM completed in ${elapsed}ms`);

    // Store result
    const candidates = (response as QuizCandidateResponse).questions;
    
    // DIAGNOSTIC: Log candidate details
    console.log(`[QuizJob] ${chunkId} Raw response candidates: ${candidates.length}`);
    if (candidates.length > 0) {
      candidates.forEach((c, i) => {
        console.log(`[QuizJob] ${chunkId}   Candidate ${i + 1}: [${c.difficulty}] ${c.topic} - ${c.question.substring(0, 60)}...`);
      });
    } else {
      console.log(`[QuizJob] ${chunkId} WARNING: LLM returned 0 candidates!`);
      console.log(`[QuizJob] ${chunkId} Full response:`, JSON.stringify(response, null, 2));
    }

    const result = {
      candidates,
      processingTimeMs: elapsed,
    };

    await ctx.runMutation(internal.studio.jobMutations.quizzes.storeQuizMapResult, {
      quizId,
      chunkIndex,
      result: JSON.stringify(result),
    });

    logger.info(`Map chunk completed`, {
      chunkIndex,
      elapsed,
      candidatesGenerated: candidates.length,
    });

    // Check if all maps are complete
    const updatedQuiz = await ctx.runQuery(internal.studio.quizzes.index.getInternal, { id: quizId });
    if (!updatedQuiz) return;

    const completedMaps = updatedQuiz.metadata?.mapResults
      ? Object.keys(updatedQuiz.metadata.mapResults).length
      : 0;
    const totalMaps = updatedQuiz.metadata?.totalMapTasks || totalChunks;

    console.log(`[QuizJob] Map progress: ${completedMaps}/${totalMaps}`);

    if (completedMaps >= totalMaps) {
      console.log(`[QuizJob] All map tasks complete, scheduling finalization`);
      await ctx.scheduler.runAfter(0, internal.studio.quizzes.job.finalizeQuizPhase, {
        quizId,
        userId,
        notebookId,
        questionCount,
        difficulty,
        focus,
      });
    }

  } catch (error) {
    const errorMeta = createErrorMetadata(error, 'map_processing');

    console.error(`[QuizJob] ${chunkId} FAILED:`, errorMeta.message);

    // Store error result
    await ctx.runMutation(internal.studio.jobMutations.quizzes.storeQuizMapResult, {
      quizId,
      chunkIndex,
      result: JSON.stringify({
        _error: true,
        errorMessage: errorMeta.message,
        isTimeout: errorMeta.type === 'llm_timeout',
        candidates: [],
      }),
    });

    logger.warn(`Map chunk failed`, {
      chunkIndex,
      error: errorMeta.message,
      errorType: errorMeta.type,
    });

    // Check if we should still proceed with partial results
    const quiz = await ctx.runQuery(internal.studio.quizzes.index.getInternal, { id: quizId });
    if (!quiz) return;

    const completedMaps = quiz.metadata?.mapResults
      ? Object.keys(quiz.metadata.mapResults).length
      : 0;
    const totalMaps = quiz.metadata?.totalMapTasks || totalChunks;
    const failedMaps = quiz.metadata?.mapResults
      ? Object.values(quiz.metadata.mapResults).filter(
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
      console.log(`[QuizJob] All tasks done. Success: ${successCount}/${totalMaps}`);

      if (successCount > 0) {
        await ctx.scheduler.runAfter(0, internal.studio.quizzes.job.finalizeQuizPhase, {
          quizId,
          userId,
          notebookId,
          questionCount,
          difficulty,
          focus,
        });
      } else {
        await ctx.runMutation(internal.studio.jobMutations.quizzes.markQuizFailed, {
          quizId,
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
}

// ============================================================
// PHASE 3: Finalize (Select + Expand + Save)
// ============================================================

export async function runFinalizeQuizPhase(
  ctx: ActionCtx,
  args: FinalizeQuizPhaseArgs,
): Promise<void> {
  "use node";

  const { quizId, userId, notebookId, questionCount, difficulty, focus } = args;

  const logger = createJobLogger({
    jobType: 'quiz',
    jobId: quizId,
    notebookId,
    userId,
  });

  logger.info('Starting finalization phase');

  try {
    // Get quiz with map results
    const quiz = await ctx.runQuery(internal.studio.quizzes.index.getInternal, { id: quizId });
    if (!quiz) {
      console.log('[QuizJob] Quiz deleted during finalization');
      return;
    }

    const mapResults = quiz.metadata?.mapResults as Record<string, string> || {};

    // Separate successful and failed results
    const allCandidates: QuizCandidate[] = [];
    const failedCount = { count: 0 };

    for (const [idx, resultJson] of Object.entries(mapResults)) {
      try {
        const parsed = JSON.parse(resultJson);
        if (parsed._error) {
          failedCount.count++;
        } else if (parsed.candidates && Array.isArray(parsed.candidates)) {
          allCandidates.push(...parsed.candidates);
        }
      } catch {
        failedCount.count++;
      }
    }

    console.log(`[QuizJob] Finalization: ${allCandidates.length} candidates collected, ${failedCount.count} failed chunks`);

    if (allCandidates.length === 0) {
      throw new Error('No successful candidates generated from any chunk');
    }

    // Update status
    await ctx.runMutation(internal.studio.jobMutations.quizzes.updateQuizStatus, {
      quizId,
      status: 'generating',
      metadata: {
        phase: 'selecting',
        progress: 70,
        currentStep: 'Selecting best questions...',
      },
    });

    // Selection phase with LLM - select best candidates
    const selectLLM = createReduceLLM();
    const structuredSelectLLM = selectLLM.withStructuredOutput(QuizCandidateArraySchema, {
      name: 'quiz_candidate_selection',
    });

    const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;
    const selectionPrompt = getCandidateSelectionPrompt({
      candidates: allCandidates,
      targetCount: questionCount,
      difficulty,
      focus: sanitizedFocus,
    });

    // DIAGNOSTIC: Log candidates being sent to selection
    console.log(`[QuizJob] Selection prompt: ${selectionPrompt.length} chars`);
    console.log(`[QuizJob] Sending ${allCandidates.length} candidates to selection phase:`);
    allCandidates.forEach((c, i) => {
      console.log(`[QuizJob]   Candidate ${i + 1}: [${c.difficulty}] ${c.topic} - ${c.question.substring(0, 80)}...`);
    });

    const startTime = Date.now();
    const selectionResponse = await invokeStudioLlm({
      invoke: () =>
        (structuredSelectLLM as any).invoke(
          [new SystemMessage(REDUCE_SELECT_SYSTEM_PROMPT), new HumanMessage(selectionPrompt)],
          createLangSmithRunConfig({
            runName: 'QuizJob.Select',
            tags: ['agent', 'quiz', 'reduce'],
            metadata: {
              questionCount,
              difficulty,
              focus: focus || 'none',
              inputCandidates: allCandidates.length,
            },
          })
        ),
      timeoutMs: CONFIG.REDUCE_TIMEOUT_MS,
      phaseLabel: 'QuizSelect',
      retry: { maxAttempts: 2, baseDelayMs: 1000 },
    });

    let selectedCandidates = (selectionResponse as QuizCandidateResponse).questions;
    console.log(`[QuizJob] Selection completed in ${Date.now() - startTime}ms, selected ${selectedCandidates.length} candidates`);

    // DIAGNOSTIC: Log selected candidates
    if (selectedCandidates.length === 0) {
      console.log(`[QuizJob] WARNING: Selection phase returned 0 candidates!`);
      console.log(`[QuizJob] FALLBACK: Using all ${allCandidates.length} input candidates instead of failing.`);
      selectedCandidates = allCandidates.slice(0, questionCount);
      console.log(`[QuizJob] Fallback: Using ${selectedCandidates.length} candidates for expansion`);
    } else {
      console.log(`[QuizJob] Selected candidates:`);
      selectedCandidates.forEach((c, i) => {
        console.log(`[QuizJob]   Selected ${i + 1}: [${c.difficulty}] ${c.topic} - ${c.question.substring(0, 80)}...`);
      });
    }

    // Update status for expansion
    await ctx.runMutation(internal.studio.jobMutations.quizzes.updateQuizStatus, {
      quizId,
      status: 'generating',
      metadata: {
        phase: 'expanding',
        progress: 80,
        currentStep: 'Generating question options...',
      },
    });

    // Expand candidates into full questions with distractors
    const expandLLM = createExpandLLM();
    const structuredExpandLLM = createQuestionLLM(expandLLM);

    console.log(`[QuizJob] Expanding ${selectedCandidates.length} candidates with concurrency ${CONFIG.EXPAND_CONCURRENCY}`);

    const expandedResults = await allWithConcurrency(
      selectedCandidates.map((candidate, index) => {
        return async () => {
          try {
            const prompt = getExpandPrompt(candidate);
            return await invokeStudioLlm({
              invoke: () =>
                (structuredExpandLLM as any).invoke(
                  [new SystemMessage(EXPAND_QUESTION_SYSTEM_PROMPT), new HumanMessage(prompt)],
                  createLangSmithRunConfig({
                    runName: 'QuizJob.Expand',
                    tags: ['agent', 'quiz', 'expand'],
                    metadata: {
                      difficulty: candidate.difficulty,
                      topic: candidate.topic,
                    },
                  })
                ),
              timeoutMs: CONFIG.EXPAND_TIMEOUT_MS,
              phaseLabel: 'QuizExpand',
              retry: { maxAttempts: 2, baseDelayMs: 1000 },
            });
          } catch (error) {
            console.log(`[QuizJob] Failed to expand candidate ${index}: ${error}`);
            return null;
          }
        };
      }),
      CONFIG.EXPAND_CONCURRENCY
    );

    const finalQuestions = expandedResults.filter((q): q is QuizQuestion => q !== null);
    console.log(`[QuizJob] Expanded ${finalQuestions.length} questions (${expandedResults.length - finalQuestions.length} failed)`);

    if (finalQuestions.length === 0) {
      throw new Error('All question expansions failed');
    }

    // Update status for finalizing
    await ctx.runMutation(internal.studio.jobMutations.quizzes.updateQuizStatus, {
      quizId,
      status: 'generating',
      metadata: {
        phase: 'finalizing',
        progress: 90,
        currentStep: 'Saving results...',
      },
    });

    // Generate title
    let title = 'Quiz';
    try {
      const titleContent = finalQuestions.map(q => q.question).join(' ').substring(0, 2000);
      title = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
        chunk: titleContent,
      });
    } catch (e) {
      console.log('[QuizJob] Title generation failed, using default');
    }

    // Save results
    await ctx.runMutation(internal.studio.jobMutations.quizzes.saveQuizResults, {
      quizId,
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
    await ctx.runMutation(internal.studio.jobMutations.quizzes.clearQuizMapData, { quizId });

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

    await ctx.runMutation(internal.studio.jobMutations.quizzes.markQuizFailed, {
      quizId,
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
}

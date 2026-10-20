"use node";

/**
 * Quiz generation — phase logic.
 * @see ./job.ts for Convex `internalAction` registrations.
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { allWithConcurrency, sanitizeUserInput } from "../../_agents/_shared/index";
import { withLanguageInstruction } from "../../_agents/_shared/languageInstruction";
import { createErrorMetadata, createJobLogger } from "../../_agents/_shared/logging";
import { planStudioJobMapPhase } from "../../_agents/_shared/studioExecutionMode";
import {
  aggregateStudioJobTelemetry,
  withStudioTelemetryMetadata,
} from "../../_agents/_shared/studioJobTelemetry";
import { countTokens } from "../../_agents/_shared/tokenizer";
import { addTokenUsage, type TokenUsage } from "../../_agents/_shared/usageAggregate";
import {
  type QuestionVerification,
  type QuizVerificationResponse,
  QuizVerificationSchema,
  VERIFY_SYSTEM_PROMPT,
  type VerifiableQuestion,
  verifyQuizQuestions,
} from "../../_agents/quiz/answerVerification";
import {
  applySelectedCandidateIndices,
  EXPAND_QUESTION_SYSTEM_PROMPT,
  getCandidateMapPrompt,
  getCandidateMapRecoveryPrompt,
  getCandidateMapTopUpPrompt,
  getCandidateSelectionPrompt,
  getExpandPrompt,
  MAP_CANDIDATES_SYSTEM_PROMPT,
  type QuizCandidate,
  QuizCandidateArraySchema,
  type QuizCandidateIndexSelection,
  QuizCandidateIndexSelectionSchema,
  type QuizCandidateResponse,
  type QuizQuestion,
  QuizQuestionSchema,
  REDUCE_SELECT_SYSTEM_PROMPT,
} from "../../_agents/quiz/prompts";
import { createStructuredLLM } from "../../_agents/quiz/structuredLlm";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { env } from "../../_lib/env";
import { pickSpread } from "../_job/collapsePlan";
import {
  generateTitleWithinDeadline,
  invokeStudioLlm,
  invokeWithinBudget,
} from "../_job/invokeStudioLlm";
import {
  createJobDeadline,
  STUDIO_FINALIZE_BUDGET_MS,
  STUDIO_SAVE_RESERVE_MS,
} from "../_job/jobDeadline";
import {
  assertMapFailuresAcceptable,
  mapChunkRetryDelayMs,
  mapFailureRate,
} from "../_job/mapFailures";
import { createStudioChunkHelpers } from "../_job/studioChunks";

const { packChunks, validateChunks } = createStudioChunkHelpers("QuizGraph");

/**
 * Single-question expansion. Reasoning stays off: one question is a short JSON fill, and reasoning
 * shares max_tokens with the answer, so it could use the whole budget and drop the question (#201).
 */
export const QUIZ_EXPAND_LLM_OPTIONS = {
  maxTokens: 4_096,
  temperature: 0.3,
  reasoningEnabled: false,
} as const;

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 5_000,
  PER_CHUNK_TIMEOUT_MS: 90_000, // 90 seconds per chunk (under 100s Cloudflare limit)
  REDUCE_TIMEOUT_MS: 400_000, // all selection attempts together
  // Per question expansion, all attempts together. Timeouts are not retried, so a
  // slow provider gives up after 60s; the reserves below assume this bound.
  EXPAND_TIMEOUT_MS: 60_000,
  // Most held back from selection for expansion waves + save: covers the largest quiz
  // the app offers (30 questions = 6 waves of 60s + 30s save), leaving selection 150s.
  MAX_EXPAND_RESERVE_MS: 390_000,
  MIN_QUESTIONS_PER_CHUNK: 2,
  MAX_QUESTIONS_PER_CHUNK: 20,
  BUFFER_MULTIPLIER: 1.2,
  EXPAND_CONCURRENCY: 5,
  /** Extra map rounds when the model returns empty or too few candidates */
  MAP_MAX_ROUNDS: 3,
  // Answer-key verification (#219). Finalization must end before Convex's 600s
  // action limit, so verification and backfill only run while time is left.
  VERIFY_TIMEOUT_MS: 120_000, // per verification batch
  VERIFY_MAX_TOKENS: 16_000, // DeepSeek reasoning shares this budget
  MIN_VERIFY_CALL_MS: 20_000, // below this, questions stay unchecked
  BACKFILL_MIN_REMAINING_MS: 210_000, // expand (60s) + verify (120s) + save (30s)
  BACKFILL_EXPAND_RESERVE_MS: 150_000, // held back from refill expansions: verify + save
  MIN_EXPAND_CALL_MS: 15_000, // refill expansions below this per-call budget are skipped
  BACKFILL_BUFFER_MULTIPLIER: 1.5,
} as const;

function countVerification(statuses: QuestionVerification[]) {
  return {
    passed: statuses.filter((s) => s.status === "passed").length,
    failed: statuses.filter((s) => s.status === "failed").length,
    unchecked: statuses.filter((s) => s.status === "unchecked").length,
  };
}

function normalizeQuizCandidateDedupeKey(c: QuizCandidate): string {
  const t = `${c.topic}`.toLowerCase().replace(/\s+/g, " ").trim();
  const q = c.question.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 220);
  return `${t}|${q}`;
}

function appendUniqueCandidates(
  acc: QuizCandidate[],
  incoming: QuizCandidate[],
  cap: number
): void {
  const seen = new Set(acc.map(normalizeQuizCandidateDedupeKey));
  for (const c of incoming) {
    if (acc.length >= cap) return;
    const key = normalizeQuizCandidateDedupeKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    acc.push(c);
  }
}

export type QuizGenerationPhaseArgs = {
  quizId: Id<"quizzes">;
  userId: string;
  notebookId: Id<"notebooks">;
  documentIds: Id<"documents">[];
  questionCount: number;
  difficulty: string;
  focus?: string;
};

export type ProcessQuizMapChunkPhaseArgs = {
  quizId: Id<"quizzes">;
  userId: string;
  notebookId: Id<"notebooks">;
  chunkIndex: number;
  /** 1-based; set when a failed chunk is re-run. */
  attempt?: number;
  totalChunks: number;
  chunk: string;
  questionCount: number;
  questionsPerChunk: number;
  difficulty: string;
  focus?: string;
};

export type FinalizeQuizPhaseArgs = {
  quizId: Id<"quizzes">;
  userId: string;
  notebookId: Id<"notebooks">;
  questionCount: number;
  difficulty: string;
  focus?: string;
};

// ============================================================
// PHASE 1: Initialize & Schedule Map Tasks
// ============================================================

export async function runQuizGenerationPhase(
  ctx: ActionCtx,
  args: QuizGenerationPhaseArgs
): Promise<void> {
  const { quizId, userId, notebookId, documentIds, questionCount, difficulty, focus } = args;

  // Initialize structured logger
  const logger = createJobLogger({
    jobType: "quiz",
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
    logger.phaseStart("initializing", { progress: 5 });
    await ctx.runMutation(internal.studio.jobMutations.quizzes.updateQuizStatus, {
      quizId,
      status: "generating",
      metadata: {
        phase: "initializing",
        progress: 5,
        currentStep: "Initializing...",
      },
    });
    logger.phaseComplete("initializing");

    // Phase: Loading documents
    logger.phaseStart("loading_documents", { progress: 15, docCount: documentIds.length });
    await ctx.runMutation(internal.studio.jobMutations.quizzes.updateQuizStatus, {
      quizId,
      status: "generating",
      metadata: {
        phase: "loading_documents",
        progress: 15,
        currentStep: "Loading documents...",
      },
    });

    // Get document chunks
    const chunkObjects = await ctx.runAction(internal.documents.chunks.fetchChunks, {
      documentIds,
      topic: focus,
    });
    // Sources left after narrowing to the requested topic (#288).
    const topicDocumentCount = new Set(chunkObjects.map((c) => c.documentId)).size;

    // Extract content from chunk objects
    const rawChunks = chunkObjects.map((chunk: any) => chunk.content);

    logger.phaseComplete("loading_documents", { chunkCount: rawChunks.length });

    // Validate and pack chunks
    const validatedChunks = validateChunks(rawChunks);
    const mapPlan = planStudioJobMapPhase({
      documentCount: topicDocumentCount,
      chunks: validatedChunks,
      estimateTokens: countTokens,
      pack: (chunks) => packChunks(chunks, CONFIG.MAP_CHUNK_SIZE_TOKENS),
    });
    const scheduledChunks = mapPlan.skipMapContent ? [mapPlan.skipMapContent] : mapPlan.mapChunks;

    console.log(
      `[QuizJob] Planned ${validatedChunks.length} validated chunks into ${scheduledChunks.length} map tasks (${mapPlan.mode})`
    );

    if (scheduledChunks.length === 0) {
      throw new Error("No valid chunks to process");
    }

    // Calculate questions per chunk
    const questionsPerChunk = Math.max(
      CONFIG.MIN_QUESTIONS_PER_CHUNK,
      Math.min(
        CONFIG.MAX_QUESTIONS_PER_CHUNK,
        Math.ceil((questionCount / scheduledChunks.length) * CONFIG.BUFFER_MULTIPLIER)
      )
    );

    console.log(`[QuizJob] Questions per chunk: ${questionsPerChunk}`);

    // Initialize map phase metadata
    await ctx.runMutation(internal.studio.jobMutations.quizzes.initQuizMapPhase, {
      quizId,
      totalMapTasks: scheduledChunks.length,
      questionCount,
      difficulty,
      focus,
    });

    // Schedule each map task as a separate action
    for (let i = 0; i < scheduledChunks.length; i++) {
      await ctx.scheduler.runAfter(0, internal.studio.quizzes.job.processQuizMapChunk, {
        quizId,
        userId,
        notebookId,
        chunkIndex: i,
        totalChunks: scheduledChunks.length,
        chunk: scheduledChunks[i],
        questionCount,
        questionsPerChunk,
        difficulty,
        focus,
      });
      console.log(`[QuizJob] Scheduled map task ${i + 1}/${scheduledChunks.length}`);
    }

    logger.info("Map phase initialized", {
      totalMapTasks: scheduledChunks.length,
      chunkSizes: scheduledChunks.map((c) => c.length),
      questionsPerChunk,
      executionMode: mapPlan.mode,
    });
  } catch (error) {
    const errorMeta = createErrorMetadata(error, "initializing");

    logger.jobError(error, {
      phase: "initializing",
      errorType: errorMeta.type,
      retryable: errorMeta.retryable,
    });

    await ctx.runMutation(internal.studio.jobMutations.quizzes.markQuizFailed, {
      quizId,
      error: errorMeta.message,
      metadata: {
        phase: "failed",
        progress: 0,
        failedAt: Date.now(),
        errorPhase: "initializing",
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
  args: ProcessQuizMapChunkPhaseArgs
): Promise<void> {
  const {
    quizId,
    userId,
    notebookId,
    chunkIndex,
    totalChunks,
    chunk,
    questionCount,
    questionsPerChunk,
    difficulty,
    focus,
  } = args;

  const logger = createJobLogger({
    jobType: "quiz",
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

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, {
        userId: userId as any,
      });
    } catch (e) {
      console.warn(
        "[quiz] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

    let tokenUsage: TokenUsage | undefined;
    const structuredLLM = createStructuredLLM<QuizCandidateResponse>(
      QuizCandidateArraySchema,
      "quiz_candidates",
      {
        model: env.FAST_LLM,
        temperature: 0.4,
        maxTokens: 16_000,
        onUsage: (usage) => {
          tokenUsage = addTokenUsage(tokenUsage, usage);
        },
      }
    );

    const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;

    console.log(`[QuizJob] ${chunkId} Chunk preview: ${chunk.substring(0, 200)}...`);
    console.log(
      `[QuizJob] ${chunkId} Target questions: ${questionsPerChunk}, Difficulty: ${difficulty}`
    );

    const candidates: QuizCandidate[] = [];
    let totalMapElapsedMs = 0;

    for (let round = 1; round <= CONFIG.MAP_MAX_ROUNDS; round++) {
      const need = questionsPerChunk - candidates.length;
      if (need <= 0) break;

      const prompt =
        round === 1
          ? getCandidateMapPrompt({
              chunk,
              questionCount,
              questionsPerChunk,
              difficulty,
              focus: sanitizedFocus,
            })
          : candidates.length === 0
            ? getCandidateMapRecoveryPrompt({
                chunk,
                questionCount,
                need: questionsPerChunk,
                difficulty,
                focus: sanitizedFocus,
              })
            : getCandidateMapTopUpPrompt({
                chunk,
                questionCount,
                need,
                difficulty,
                focus: sanitizedFocus,
                existingCandidates: candidates,
              });

      console.log(
        `[QuizJob] ${chunkId} Map round ${round}/${CONFIG.MAP_MAX_ROUNDS} — need ${need}, prompt ${prompt.length} chars`
      );

      const roundStart = Date.now();
      let response: QuizCandidateResponse;
      try {
        response = await invokeStudioLlm({
          invoke: () =>
            (structuredLLM as any).invoke([
              new SystemMessage(withLanguageInstruction(MAP_CANDIDATES_SYSTEM_PROMPT, language)),
              new HumanMessage(prompt),
            ]),
          timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
          phaseLabel: "QuizMap",
          onRetry: (attempt, error) => {
            console.log(`[QuizJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`);
          },
        });
      } catch (error) {
        console.log(`[QuizJob] ${chunkId} LLM invocation failed (round ${round}): ${error}`);
        throw error;
      }

      const roundElapsed = Date.now() - roundStart;
      totalMapElapsedMs += roundElapsed;

      const incoming = (response as QuizCandidateResponse).questions ?? [];
      const beforeLen = candidates.length;
      appendUniqueCandidates(candidates, incoming, questionsPerChunk);

      console.log(
        `[QuizJob] ${chunkId} Round ${round} done in ${roundElapsed}ms — raw ${incoming.length}, merged ${beforeLen}→${candidates.length}/${questionsPerChunk}`
      );

      if (incoming.length === 0) {
        console.log(`[QuizJob] ${chunkId} WARNING: round ${round} returned 0 candidates`);
        console.log(`[QuizJob] ${chunkId} Full response:`, JSON.stringify(response, null, 2));
      }

      if (candidates.length >= questionsPerChunk) break;
    }

    console.log(
      `[QuizJob] ${chunkId} Map phase total ${totalMapElapsedMs}ms, final candidates: ${candidates.length}`
    );

    if (candidates.length > 0) {
      candidates.forEach((c, i) => {
        console.log(
          `[QuizJob] ${chunkId}   Candidate ${i + 1}: [${c.difficulty}] ${c.topic} - ${c.question.substring(0, 60)}...`
        );
      });
    } else {
      console.log(
        `[QuizJob] ${chunkId} WARNING: after ${CONFIG.MAP_MAX_ROUNDS} rounds still 0 candidates`
      );
    }

    const result = {
      candidates,
      processingTimeMs: totalMapElapsedMs,
      ...(tokenUsage !== undefined && tokenUsage.total > 0 ? { tokenUsage } : {}),
    };

    await ctx.runMutation(internal.studio.jobMutations.quizzes.storeQuizMapResult, {
      quizId,
      chunkIndex,
      result: JSON.stringify(result),
    });

    logger.info(`Map chunk completed`, {
      chunkIndex,
      elapsed: totalMapElapsedMs,
      candidatesGenerated: candidates.length,
    });

    // Check if all maps are complete
    const updatedQuiz = await ctx.runQuery(internal.studio.quizzes.index.getInternal, {
      id: quizId,
    });
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
    const retryDelayMs = mapChunkRetryDelayMs(args.attempt);
    if (retryDelayMs !== null) {
      console.warn(
        `[quizzes] map chunk ${args.chunkIndex + 1} failed on attempt ${args.attempt ?? 1}, retrying in ${retryDelayMs}ms:`,
        error instanceof Error ? error.message : String(error)
      );
      await ctx.scheduler.runAfter(retryDelayMs, internal.studio.quizzes.job.processQuizMapChunk, {
        ...args,
        attempt: (args.attempt ?? 1) + 1,
      });
      return;
    }

    const errorMeta = createErrorMetadata(error, "map_processing");

    console.error(`[QuizJob] ${chunkId} FAILED:`, errorMeta.message);

    // Store error result
    await ctx.runMutation(internal.studio.jobMutations.quizzes.storeQuizMapResult, {
      quizId,
      chunkIndex,
      result: JSON.stringify({
        _error: true,
        errorMessage: errorMeta.message,
        isTimeout: errorMeta.type === "llm_timeout",
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
      ? Object.values(quiz.metadata.mapResults).filter((r: any) => {
          try {
            const parsed = JSON.parse(r as string);
            return parsed._error;
          } catch {
            return false;
          }
        }).length
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
          error: "All map tasks failed",
          metadata: {
            phase: "failed",
            errorPhase: "map_processing",
            errorType: "llm_failure",
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
  args: FinalizeQuizPhaseArgs
): Promise<void> {
  const { quizId, userId, notebookId, questionCount, difficulty, focus } = args;

  const logger = createJobLogger({
    jobType: "quiz",
    jobId: quizId,
    notebookId,
    userId,
  });

  logger.info("Starting finalization phase");

  const deadline = createJobDeadline(STUDIO_FINALIZE_BUDGET_MS);

  try {
    // Get quiz with map results
    const quiz = await ctx.runQuery(internal.studio.quizzes.index.getInternal, { id: quizId });
    if (!quiz) {
      console.log("[QuizJob] Quiz deleted during finalization");
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, {
        userId: userId as any,
      });
    } catch (e) {
      console.warn(
        "[quiz] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

    const mapResults = (quiz.metadata?.mapResults as Record<string, string>) || {};

    // Separate successful and failed results
    const allCandidates: QuizCandidate[] = [];
    const failedCount = { count: 0 };

    for (const [_idx, resultJson] of Object.entries(mapResults)) {
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

    console.log(
      `[QuizJob] Finalization: ${allCandidates.length} candidates collected, ${failedCount.count} failed chunks`
    );

    assertMapFailuresAcceptable(Object.keys(mapResults).length, failedCount.count);

    if (allCandidates.length === 0) {
      throw new Error("No successful candidates generated from any chunk");
    }

    // Update status
    await ctx.runMutation(internal.studio.jobMutations.quizzes.updateQuizStatus, {
      quizId,
      status: "generating",
      metadata: {
        phase: "selecting",
        progress: 70,
        currentStep: "Selecting best questions...",
      },
    });

    // Selection phase: LLM returns 1-based candidate IDs (not full-object echo — reduces position bias)
    let reduceUsage: TokenUsage | undefined;
    const structuredSelectLLM = createStructuredLLM<QuizCandidateIndexSelection>(
      QuizCandidateIndexSelectionSchema,
      "quiz_candidate_index_selection",
      {
        model: env.QUIZ_LLM,
        maxTokens: 24_000,
        temperature: 0.3,
        reasoningEnabled: true,
        onUsage: (usage) => {
          reduceUsage = addTokenUsage(reduceUsage, usage);
        },
      }
    );

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
      console.log(
        `[QuizJob]   Candidate ${i + 1}: [${c.difficulty}] ${c.topic} - ${c.question.substring(0, 80)}...`
      );
    });

    const startTime = Date.now();
    let selectedIndices: number[] = [];
    try {
      const selectionResponse = await invokeWithinBudget({
        invoke: () =>
          (structuredSelectLLM as any).invoke([
            new SystemMessage(withLanguageInstruction(REDUCE_SELECT_SYSTEM_PROMPT, language)),
            new HumanMessage(selectionPrompt),
          ]),
        // Expansion runs in waves of EXPAND_CONCURRENCY, each up to EXPAND_TIMEOUT_MS; hold
        // that back (plus the save reserve) so a slow selection cannot starve later waves.
        timeoutMs: deadline.stepTimeoutMs(
          CONFIG.REDUCE_TIMEOUT_MS,
          Math.min(
            CONFIG.MAX_EXPAND_RESERVE_MS,
            Math.ceil(questionCount / CONFIG.EXPAND_CONCURRENCY) * CONFIG.EXPAND_TIMEOUT_MS +
              STUDIO_SAVE_RESERVE_MS
          )
        ),
        phaseLabel: "QuizSelect",
        retry: { maxAttempts: 2, baseDelayMs: 1000 },
      });
      selectedIndices = (selectionResponse as QuizCandidateIndexSelection).selectedIndices ?? [];
    } catch (error) {
      // Selection may get little time on the largest quizzes; a spread pick of the
      // candidates still yields a full quiz.
      logger.phaseError("selection", error, {
        fallback: "spread_candidates",
        candidateCount: allCandidates.length,
        targetCount: questionCount,
      });
    }

    // applySelectedCandidateIndices fills gaps from the front of the list, so when no
    // returned index resolves, spread the pick across all candidates instead.
    const anyIndexResolves = selectedIndices.some((raw) => {
      const oneBased = Math.round(raw);
      return oneBased >= 1 && oneBased <= allCandidates.length;
    });
    let selectedCandidates = anyIndexResolves
      ? applySelectedCandidateIndices(allCandidates, selectedIndices, questionCount)
      : pickSpread(allCandidates, questionCount);
    console.log(
      `[QuizJob] Selection completed in ${Date.now() - startTime}ms, resolved ${selectedCandidates.length} candidates (raw indices: ${selectedIndices.length})`
    );

    // DIAGNOSTIC: Log selected candidates
    if (selectedCandidates.length === 0) {
      console.log(`[QuizJob] WARNING: Selection phase resolved 0 candidates!`);
      console.log(
        `[QuizJob] FALLBACK: Using all ${allCandidates.length} input candidates instead of failing.`
      );
      selectedCandidates = allCandidates.slice(0, questionCount);
      console.log(
        `[QuizJob] Fallback: Using ${selectedCandidates.length} candidates for expansion`
      );
    } else {
      console.log(`[QuizJob] Selected candidates:`);
      selectedCandidates.forEach((c, i) => {
        console.log(
          `[QuizJob]   Selected ${i + 1}: [${c.difficulty}] ${c.topic} - ${c.question.substring(0, 80)}...`
        );
      });
    }

    // Update status for expansion
    await ctx.runMutation(internal.studio.jobMutations.quizzes.updateQuizStatus, {
      quizId,
      status: "generating",
      metadata: {
        phase: "expanding",
        progress: 80,
        currentStep: "Generating question options...",
      },
    });

    // Expand candidates into full questions with distractors
    const structuredExpandLLM = createStructuredLLM<QuizQuestion>(
      QuizQuestionSchema,
      "quiz_question",
      {
        model: env.QUIZ_LLM,
        ...QUIZ_EXPAND_LLM_OPTIONS,
        onUsage: (usage) => {
          reduceUsage = addTokenUsage(reduceUsage, usage);
        },
      }
    );

    /**
     * Expands candidates into full questions. Every call is bounded by what is left of
     * the deadline after the save reserve, so later waves cannot push past it; refill
     * calls (`isRefill`) also keep the verify + save reserve and get one attempt. Calls
     * that would start with too little time are skipped.
     */
    const expandCandidates = (candidates: QuizCandidate[], isRefill = false) =>
      allWithConcurrency(
        candidates.map((candidate, index) => {
          return async (): Promise<QuizQuestion | null> => {
            const timeoutMs = deadline.stepTimeoutMs(
              CONFIG.EXPAND_TIMEOUT_MS,
              isRefill ? CONFIG.BACKFILL_EXPAND_RESERVE_MS : STUDIO_SAVE_RESERVE_MS
            );
            if (timeoutMs < CONFIG.MIN_EXPAND_CALL_MS) {
              console.log(`[QuizJob] Skipped expanding candidate ${index}: out of time budget`);
              return null;
            }
            try {
              const prompt = getExpandPrompt(candidate);
              return await invokeWithinBudget({
                invoke: () =>
                  (structuredExpandLLM as any).invoke([
                    new SystemMessage(
                      withLanguageInstruction(EXPAND_QUESTION_SYSTEM_PROMPT, language)
                    ),
                    new HumanMessage(prompt),
                  ]),
                timeoutMs,
                phaseLabel: "QuizExpand",
                retry: { maxAttempts: isRefill ? 1 : 2, baseDelayMs: 1000 },
              });
            } catch (error) {
              console.log(`[QuizJob] Failed to expand candidate ${index}: ${error}`);
              return null;
            }
          };
        }),
        CONFIG.EXPAND_CONCURRENCY
      );

    // Pair each expanded question with the passage its candidate came from, for verification.
    const toVerifiable = (
      candidates: QuizCandidate[],
      results: (QuizQuestion | null)[]
    ): VerifiableQuestion[] =>
      results.flatMap((question, i) =>
        question ? [{ question, snippet: candidates[i].contextSnippet }] : []
      );

    console.log(
      `[QuizJob] Expanding ${selectedCandidates.length} candidates with concurrency ${CONFIG.EXPAND_CONCURRENCY}`
    );

    const expandedQuestions = toVerifiable(
      selectedCandidates,
      await expandCandidates(selectedCandidates)
    );
    console.log(
      `[QuizJob] Expanded ${expandedQuestions.length} questions (${selectedCandidates.length - expandedQuestions.length} failed)`
    );

    if (expandedQuestions.length === 0) {
      throw new Error("All question expansions failed");
    }

    // Verify each answer key against its source passage; drop failures and refill
    // from the unselected candidates while there is time.
    await ctx.runMutation(internal.studio.jobMutations.quizzes.updateQuizStatus, {
      quizId,
      status: "generating",
      metadata: {
        phase: "verifying",
        progress: 85,
        currentStep: "Checking answers against your sources...",
      },
    });

    const structuredVerifyLLM = createStructuredLLM<QuizVerificationResponse>(
      QuizVerificationSchema,
      "quiz_answer_verification",
      {
        model: env.QUIZ_LLM,
        maxTokens: CONFIG.VERIFY_MAX_TOKENS,
        temperature: 0,
        reasoningEnabled: true,
        onUsage: (usage) => {
          reduceUsage = addTokenUsage(reduceUsage, usage);
        },
      }
    );

    const verifyQuestions = (items: VerifiableQuestion[]) =>
      verifyQuizQuestions(items, {
        judge: async (prompt) => {
          const timeoutMs = deadline.stepTimeoutMs(
            CONFIG.VERIFY_TIMEOUT_MS,
            STUDIO_SAVE_RESERVE_MS
          );
          if (timeoutMs < CONFIG.MIN_VERIFY_CALL_MS) {
            throw new Error("No time left in the finalize budget to verify answers");
          }
          return invokeStudioLlm({
            invoke: () =>
              structuredVerifyLLM.invoke([
                new SystemMessage(VERIFY_SYSTEM_PROMPT),
                new HumanMessage(prompt),
              ]),
            timeoutMs,
            phaseLabel: "QuizVerify",
            retry: { maxAttempts: 1 },
          });
        },
        onBatchError: (error, batchIndex) => {
          logger.phaseError("verify_answers", error, {
            batchIndex,
            outcome: "questions kept unverified",
          });
        },
      });

    const keepVerified = (items: VerifiableQuestion[], statuses: QuestionVerification[]) =>
      items.flatMap((item, i) => {
        const verdict = statuses[i];
        if (verdict.status === "failed") {
          logger.info(`Dropped question that failed the answer check: ${verdict.reason}`, {
            phase: "verify_answers",
            question: item.question.question.substring(0, 120),
            reason: verdict.reason,
          });
          return [];
        }
        return [item.question];
      });

    const verifyStatuses = await verifyQuestions(expandedQuestions);
    const finalQuestions = keepVerified(expandedQuestions, verifyStatuses);

    let backfillStatuses: QuestionVerification[] = [];
    let backfilledCount = 0;
    const deficit = questionCount - finalQuestions.length;
    if (deficit > 0) {
      const selectedSet = new Set(selectedCandidates);
      const pool = allCandidates.filter((candidate) => !selectedSet.has(candidate));
      if (pool.length > 0 && deadline.remainingMs() >= CONFIG.BACKFILL_MIN_REMAINING_MS) {
        const refill = pickSpread(pool, Math.ceil(deficit * CONFIG.BACKFILL_BUFFER_MULTIPLIER));
        const refillQuestions = toVerifiable(refill, await expandCandidates(refill, true));
        const refillStatuses = await verifyQuestions(refillQuestions);
        // Use refill questions in order until the deficit is filled; only those
        // looked at count towards the verification totals.
        let used = 0;
        let usable = 0;
        while (used < refillQuestions.length && usable < deficit) {
          if (refillStatuses[used].status !== "failed") usable++;
          used++;
        }
        backfillStatuses = refillStatuses.slice(0, used);
        const refillKept = keepVerified(refillQuestions.slice(0, used), backfillStatuses);
        backfilledCount = refillKept.length;
        finalQuestions.push(...refillKept);
      } else {
        logger.info(`Not backfilling ${deficit} questions`, {
          phase: "verify_backfill_skipped",
          poolSize: pool.length,
          remainingMs: deadline.remainingMs(),
        });
      }
    }

    const verification = countVerification([...verifyStatuses, ...backfillStatuses]);
    const reduceLatencyMs = Date.now() - startTime;
    logger.info("Answer verification complete", {
      phase: "verify_answers_complete",
      ...verification,
      backfilled: backfilledCount,
      finalCount: finalQuestions.length,
    });

    if (finalQuestions.length === 0) {
      throw new Error(
        "None of the generated questions passed the answer check against your sources. Try again, or choose different sources."
      );
    }

    // Update status for finalizing
    await ctx.runMutation(internal.studio.jobMutations.quizzes.updateQuizStatus, {
      quizId,
      status: "generating",
      metadata: {
        phase: "finalizing",
        progress: 90,
        currentStep: "Saving results...",
      },
    });

    // Generate title
    let title = "Quiz";
    try {
      const titleContent = finalQuestions
        .map((q) => q.question)
        .join(" ")
        .substring(0, 2000);
      title = await generateTitleWithinDeadline(deadline, titleContent, "QuizTitle");
    } catch (_e) {
      console.log("[QuizJob] Title generation failed, using default");
    }

    // Save results
    await ctx.runMutation(internal.studio.jobMutations.quizzes.saveQuizResults, {
      quizId,
      questions: finalQuestions,
      metadata: withStudioTelemetryMetadata(
        {
          title,
          questionCount: finalQuestions.length,
          phase: "completed",
          progress: 100,
          completedAt: Date.now(),
          mapSuccessCount: Object.keys(mapResults).length - failedCount.count,
          mapFailedCount: failedCount.count,
          answerVerification: { ...verification, backfilled: backfilledCount },
        },
        aggregateStudioJobTelemetry({
          mapResults: Object.values(mapResults),
          reduce: { latencyMs: reduceLatencyMs, tokenUsage: reduceUsage },
        })
      ),
    });

    // Clear intermediate data
    await ctx.runMutation(internal.studio.jobMutations.quizzes.clearQuizMapData, { quizId });

    // Consume rate limit token on success
    await ctx.runMutation(internal._lib.limits.consumeDailyLimitInternal, {
      userId,
      feature: "quiz",
    });

    logger.jobComplete({
      questionsGenerated: finalQuestions.length,
      title,
      mapSuccess: Object.keys(mapResults).length - failedCount.count,
      mapFailed: failedCount.count,
      mapFailureRate: mapFailureRate(Object.keys(mapResults).length, failedCount.count),
    });
  } catch (error) {
    const errorMeta = createErrorMetadata(error, "finalization");

    logger.jobError(error, {
      phase: "finalization",
      errorType: errorMeta.type,
      retryable: errorMeta.retryable,
    });

    await ctx.runMutation(internal.studio.jobMutations.quizzes.markQuizFailed, {
      quizId,
      error: errorMeta.message,
      metadata: {
        phase: "failed",
        errorPhase: "finalization",
        errorType: errorMeta.type,
        retryable: errorMeta.retryable,
        failedAt: Date.now(),
      },
    });

    throw error;
  }
}

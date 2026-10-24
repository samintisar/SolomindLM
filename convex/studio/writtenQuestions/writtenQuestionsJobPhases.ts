"use node";

/**
 * Written questions generation — phase logic.
 * @see ./job.ts for Convex `internalAction` registrations.
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { randomUUID } from "crypto";
import { z } from "zod";
import { sanitizeUserInput } from "../../_agents/_shared/index";
import { withLanguageInstruction } from "../../_agents/_shared/languageInstruction";
import { createErrorMetadata, createJobLogger } from "../../_agents/_shared/logging";
import { planStudioJobMapPhase } from "../../_agents/_shared/studioExecutionMode";
import {
  aggregateStudioJobTelemetry,
  withStudioTelemetryMetadata,
} from "../../_agents/_shared/studioJobTelemetry";
import { countTokens } from "../../_agents/_shared/tokenizer";
import { addTokenUsage, type TokenUsage } from "../../_agents/_shared/usageAggregate";
import { formatCodeInText } from "../../_agents/written_questions/codeFormatting";
import {
  appendUniqueWrittenQuestions,
  applyQuestionChecks,
  applySelectedQuestionIds,
  dedupeQuestions,
  getSelectionIdsPrompt,
  hasAnswerWorking,
  padQuestionsToTarget,
  pickReplacements,
  type WrittenQuestionCheck,
} from "../../_agents/written_questions/postprocess";
import {
  CHECK_SYSTEM_PROMPT,
  getCheckPrompt,
  getMapPrompt,
  getMapRecoveryPrompt,
  getMapTopUpPrompt,
  MAP_SYSTEM_PROMPT,
  REDUCE_SELECT_SYSTEM_PROMPT,
  type WrittenQuestion,
  WrittenQuestionChecksSchema,
  WrittenQuestionsArraySchema,
  type WrittenQuestionsResponse,
} from "../../_agents/written_questions/prompts";
import { validateSelfContained } from "../../_agents/written_questions/questionHeuristics";
import { createStructuredLLM } from "../../_agents/written_questions/structuredLlm";
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
  type JobDeadline,
  STUDIO_FINALIZE_BUDGET_MS,
  STUDIO_SAVE_RESERVE_MS,
} from "../_job/jobDeadline";
import {
  assertMapFailuresAcceptable,
  mapChunkRetryDelayMs,
  mapFailureRate,
} from "../_job/mapFailures";
import { createStudioChunkHelpers } from "../_job/studioChunks";

const { packChunks, validateChunks } = createStudioChunkHelpers("WrittenQuestionsGraph");

// ============================================================
// SCHEMAS
// ============================================================

const WrittenQuestionIdSelectionSchema = z.object({
  selectedIds: z.array(z.string()),
});

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 5_000,
  PER_CHUNK_TIMEOUT_MS: 90_000, // 90 seconds per chunk (under 100s Cloudflare limit)
  REDUCE_TIMEOUT_MS: 480_000, // all selection attempts together
  MIN_QUESTIONS_PER_CHUNK: 2,
  MAX_QUESTIONS_PER_CHUNK: 30,
  // 2.5× over-generation gives dedupe and selection headroom to still land at the target count
  BUFFER_MULTIPLIER: 2.5,
  /** Extra map rounds when the model returns empty or too few candidates */
  MAP_MAX_ROUNDS: 4,
  // Answer check (#555): one call per round; a second round checks replacements for dropped ones.
  CHECK_ROUNDS: 2,
  CHECK_TIMEOUT_MS: 150_000,
  MIN_CHECK_CALL_MS: 30_000,
  CHECK_BATCH_SIZE: 10, // questions per check call, so no call outgrows its output budget
} as const;

function normalizeMapQuestions(raw: WrittenQuestion[], questionType: string): WrittenQuestion[] {
  const expectedPoints = questionType === "short" ? 5 : 12;
  const typed = questionType === "essay" ? "essay" : "short";

  return raw
    .filter((q) => q.question?.trim() && q.modelAnswer?.trim() && validateSelfContained(q))
    .map((q) => ({
      ...q,
      id: randomUUID(),
      questionType: typed,
      rubric: {
        ...q.rubric,
        maxPoints: expectedPoints,
      },
    }));
}

export type WrittenQuestionsGenerationPhaseArgs = {
  writtenQuestionId: Id<"writtenQuestions">;
  userId: string;
  notebookId: Id<"notebooks">;
  documentIds: Id<"documents">[];
  questionCount: number;
  difficulty: string;
  questionType: string;
  focus?: string;
};

export type ProcessWrittenQuestionsMapChunkPhaseArgs = {
  writtenQuestionId: Id<"writtenQuestions">;
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
  questionType: string;
  focus?: string;
};

export type FinalizeWrittenQuestionsPhaseArgs = {
  writtenQuestionId: Id<"writtenQuestions">;
  userId: string;
  notebookId: Id<"notebooks">;
  questionCount: number;
  difficulty: string;
  questionType: string;
  focus?: string;
};

// ============================================================
// PHASE 1: Initialize & Schedule Map Tasks
// ============================================================

export async function runWrittenQuestionsGenerationPhase(
  ctx: ActionCtx,
  args: WrittenQuestionsGenerationPhaseArgs
): Promise<void> {
  const {
    writtenQuestionId,
    userId,
    notebookId,
    documentIds,
    questionCount,
    difficulty,
    questionType,
    focus,
  } = args;

  // Initialize structured logger
  const logger = createJobLogger({
    jobType: "written_questions",
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
    logger.phaseStart("initializing", { progress: 5 });
    await ctx.runMutation(
      internal.studio.jobMutations.writtenQuestions.updateWrittenQuestionsStatus,
      {
        writtenQuestionId,
        status: "generating",
        metadata: {
          phase: "initializing",
          progress: 5,
          currentStep: "Initializing...",
        },
      }
    );
    logger.phaseComplete("initializing");

    // Phase: Loading documents
    logger.phaseStart("loading_documents", { progress: 15, docCount: documentIds.length });
    await ctx.runMutation(
      internal.studio.jobMutations.writtenQuestions.updateWrittenQuestionsStatus,
      {
        writtenQuestionId,
        status: "generating",
        metadata: {
          phase: "loading_documents",
          progress: 15,
          currentStep: "Loading documents...",
        },
      }
    );

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
      `[WrittenQuestionsJob] Planned ${validatedChunks.length} validated chunks into ${scheduledChunks.length} map tasks (${mapPlan.mode})`
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

    console.log(`[WrittenQuestionsJob] Questions per chunk: ${questionsPerChunk}`);

    // Initialize map phase metadata
    await ctx.runMutation(
      internal.studio.jobMutations.writtenQuestions.initWrittenQuestionsMapPhase,
      {
        writtenQuestionId,
        totalMapTasks: scheduledChunks.length,
        questionCount,
        difficulty,
        questionType: questionType === "short" || questionType === "essay" ? questionType : "short",
        focus,
      }
    );

    // Schedule each map task as a separate action
    for (let i = 0; i < scheduledChunks.length; i++) {
      await ctx.scheduler.runAfter(
        0,
        internal.studio.writtenQuestions.job.processWrittenQuestionsMapChunk,
        {
          writtenQuestionId,
          userId,
          notebookId,
          chunkIndex: i,
          totalChunks: scheduledChunks.length,
          chunk: scheduledChunks[i],
          questionCount,
          questionsPerChunk,
          difficulty,
          questionType:
            questionType === "short" || questionType === "essay" ? questionType : "short",
          focus,
        }
      );
      console.log(`[WrittenQuestionsJob] Scheduled map task ${i + 1}/${scheduledChunks.length}`);
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

    await ctx.runMutation(
      internal.studio.jobMutations.writtenQuestions.markWrittenQuestionsFailed,
      {
        writtenQuestionId,
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
      }
    );

    throw error;
  }
}

// ============================================================
// PHASE 2: Process Individual Map Chunk
// ============================================================

export async function runProcessWrittenQuestionsMapChunkPhase(
  ctx: ActionCtx,
  args: ProcessWrittenQuestionsMapChunkPhaseArgs
): Promise<void> {
  const {
    writtenQuestionId,
    userId,
    notebookId,
    chunkIndex,
    totalChunks,
    chunk,
    questionCount,
    questionsPerChunk,
    difficulty,
    questionType,
    focus,
  } = args;

  const logger = createJobLogger({
    jobType: "written_questions",
    jobId: writtenQuestionId,
    notebookId,
    userId,
  });

  const chunkId = `[Chunk ${chunkIndex + 1}/${totalChunks}]`;
  console.log(`[WrittenQuestionsJob] ${chunkId} Starting map processing`);

  try {
    // Check if written questions still exists
    const writtenQuestion = await ctx.runQuery(internal.studio.writtenQuestions.index.getInternal, {
      id: writtenQuestionId,
    });
    if (!writtenQuestion) {
      console.log(`[WrittenQuestionsJob] ${chunkId} Written questions deleted, skipping`);
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, {
        userId: userId as any,
      });
    } catch (e) {
      console.warn(
        "[writtenQuestions] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

    // Process with LLM using structured output (Together json_schema — same as report map)
    let tokenUsage: TokenUsage | undefined;
    const structuredLLM = createStructuredLLM(WrittenQuestionsArraySchema, {
      model: env.FAST_LLM,
      temperature: 0.4,
      maxTokens: 16_000,
      onUsage: (usage) => {
        tokenUsage = addTokenUsage(tokenUsage, usage);
      },
    });

    const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;

    const candidates: WrittenQuestion[] = [];
    let totalMapElapsedMs = 0;

    for (let round = 1; round <= CONFIG.MAP_MAX_ROUNDS; round++) {
      const need = questionsPerChunk - candidates.length;
      if (need <= 0) break;

      const prompt =
        round === 1
          ? getMapPrompt({
              chunk,
              questionCount,
              questionsPerChunk,
              difficulty,
              questionType,
              focus: sanitizedFocus,
            })
          : candidates.length === 0
            ? getMapRecoveryPrompt({
                chunk,
                questionCount,
                need: questionsPerChunk,
                difficulty,
                questionType,
                focus: sanitizedFocus,
              })
            : getMapTopUpPrompt({
                chunk,
                questionCount,
                need,
                difficulty,
                questionType,
                focus: sanitizedFocus,
                existingQuestions: candidates,
              });

      console.log(
        `[WrittenQuestionsJob] ${chunkId} Map round ${round}/${CONFIG.MAP_MAX_ROUNDS} — need ${need}, prompt ${prompt.length} chars`
      );

      const roundStart = Date.now();
      const response = await invokeStudioLlm({
        invoke: () =>
          (structuredLLM as any).invoke([
            new SystemMessage(withLanguageInstruction(MAP_SYSTEM_PROMPT, language)),
            new HumanMessage(prompt),
          ]),
        timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
        phaseLabel: "WrittenQuestionsMap",
        onRetry: (attempt, error) => {
          console.log(
            `[WrittenQuestionsJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`
          );
        },
      });

      const roundElapsed = Date.now() - roundStart;
      totalMapElapsedMs += roundElapsed;

      const incoming = normalizeMapQuestions(
        (response as WrittenQuestionsResponse).questions ?? [],
        questionType
      );
      const beforeLen = candidates.length;
      appendUniqueWrittenQuestions(candidates, incoming, questionsPerChunk);

      console.log(
        `[WrittenQuestionsJob] ${chunkId} Round ${round} done in ${roundElapsed}ms — raw ${incoming.length}, merged ${beforeLen}→${candidates.length}/${questionsPerChunk}`
      );

      if (candidates.length >= questionsPerChunk) break;
    }

    const elapsed = totalMapElapsedMs;
    console.log(
      `[WrittenQuestionsJob] ${chunkId} Map phase total ${elapsed}ms, final questions: ${candidates.length}`
    );

    const questions = candidates;
    const result = {
      questions,
      processingTimeMs: elapsed,
      ...(tokenUsage !== undefined && tokenUsage.total > 0 ? { tokenUsage } : {}),
    };

    await ctx.runMutation(
      internal.studio.jobMutations.writtenQuestions.storeWrittenQuestionsMapResult,
      {
        writtenQuestionId,
        chunkIndex,
        result: JSON.stringify(result),
      }
    );

    logger.info(`Map chunk completed`, {
      chunkIndex,
      elapsed,
      questionsGenerated: questions.length,
    });

    // Check if all maps are complete
    const updatedWrittenQuestion = await ctx.runQuery(
      internal.studio.writtenQuestions.index.getInternal,
      { id: writtenQuestionId }
    );
    if (!updatedWrittenQuestion) return;

    const completedMaps = updatedWrittenQuestion.metadata?.mapResults
      ? Object.keys(updatedWrittenQuestion.metadata.mapResults).length
      : 0;
    const totalMaps = updatedWrittenQuestion.metadata?.totalMapTasks || totalChunks;

    console.log(`[WrittenQuestionsJob] Map progress: ${completedMaps}/${totalMaps}`);

    if (completedMaps >= totalMaps) {
      console.log(`[WrittenQuestionsJob] All map tasks complete, scheduling finalization`);
      await ctx.scheduler.runAfter(
        0,
        internal.studio.writtenQuestions.job.finalizeWrittenQuestionsPhase,
        {
          writtenQuestionId,
          userId,
          notebookId,
          questionCount,
          difficulty,
          questionType,
          focus,
        }
      );
    }
  } catch (error) {
    const retryDelayMs = mapChunkRetryDelayMs(args.attempt);
    if (retryDelayMs !== null) {
      console.warn(
        `[writtenQuestions] map chunk ${args.chunkIndex + 1} failed on attempt ${args.attempt ?? 1}, retrying in ${retryDelayMs}ms:`,
        error instanceof Error ? error.message : String(error)
      );
      await ctx.scheduler.runAfter(
        retryDelayMs,
        internal.studio.writtenQuestions.job.processWrittenQuestionsMapChunk,
        {
          ...args,
          attempt: (args.attempt ?? 1) + 1,
        }
      );
      return;
    }

    const errorMeta = createErrorMetadata(error, "map_processing");

    console.error(`[WrittenQuestionsJob] ${chunkId} FAILED:`, errorMeta.message);

    // Store error result
    await ctx.runMutation(
      internal.studio.jobMutations.writtenQuestions.storeWrittenQuestionsMapResult,
      {
        writtenQuestionId,
        chunkIndex,
        result: JSON.stringify({
          _error: true,
          errorMessage: errorMeta.message,
          isTimeout: errorMeta.type === "llm_timeout",
          questions: [],
        }),
      }
    );

    logger.warn(`Map chunk failed`, {
      chunkIndex,
      error: errorMeta.message,
      errorType: errorMeta.type,
    });

    // Check if we should still proceed with partial results
    const writtenQuestion = await ctx.runQuery(internal.studio.writtenQuestions.index.getInternal, {
      id: writtenQuestionId,
    });
    if (!writtenQuestion) return;

    const completedMaps = writtenQuestion.metadata?.mapResults
      ? Object.keys(writtenQuestion.metadata.mapResults).length
      : 0;
    const totalMaps = writtenQuestion.metadata?.totalMapTasks || totalChunks;
    const failedMaps = writtenQuestion.metadata?.mapResults
      ? Object.values(writtenQuestion.metadata.mapResults).filter((r: any) => {
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
      console.log(`[WrittenQuestionsJob] All tasks done. Success: ${successCount}/${totalMaps}`);

      if (successCount > 0) {
        await ctx.scheduler.runAfter(
          0,
          internal.studio.writtenQuestions.job.finalizeWrittenQuestionsPhase,
          {
            writtenQuestionId,
            userId,
            notebookId,
            questionCount,
            difficulty,
            questionType,
            focus,
          }
        );
      } else {
        await ctx.runMutation(
          internal.studio.jobMutations.writtenQuestions.markWrittenQuestionsFailed,
          {
            writtenQuestionId,
            error: "All map tasks failed",
            metadata: {
              phase: "failed",
              errorPhase: "map_processing",
              errorType: "llm_failure",
              failedAt: Date.now(),
            },
          }
        );
      }
    }
  }
}

// ============================================================
// PHASE 3: Finalize (Collect + Select + Save)
// ============================================================

export async function runFinalizeWrittenQuestionsPhase(
  ctx: ActionCtx,
  args: FinalizeWrittenQuestionsPhaseArgs
): Promise<void> {
  const { writtenQuestionId, userId, notebookId, questionCount, difficulty, questionType, focus } =
    args;

  const logger = createJobLogger({
    jobType: "written_questions",
    jobId: writtenQuestionId,
    notebookId,
    userId,
  });

  logger.info("Starting finalization phase");

  const deadline = createJobDeadline(STUDIO_FINALIZE_BUDGET_MS);

  try {
    // Get written questions with map results
    const writtenQuestion = await ctx.runQuery(internal.studio.writtenQuestions.index.getInternal, {
      id: writtenQuestionId,
    });
    if (!writtenQuestion) {
      console.log("[WrittenQuestionsJob] Written questions deleted during finalization");
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, {
        userId: userId as any,
      });
    } catch (e) {
      console.warn(
        "[writtenQuestions] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

    const mapResults = (writtenQuestion.metadata?.mapResults as Record<string, string>) || {};

    // Separate successful and failed results
    const allQuestions: WrittenQuestion[] = [];
    const failedCount = { count: 0 };

    for (const [_idx, resultJson] of Object.entries(mapResults)) {
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

    console.log(
      `[WrittenQuestionsJob] Finalization: ${allQuestions.length} questions collected, ${failedCount.count} failed chunks`
    );

    assertMapFailuresAcceptable(Object.keys(mapResults).length, failedCount.count);

    if (allQuestions.length === 0) {
      throw new Error("No successful questions generated from any chunk");
    }

    // Update status for selection
    await ctx.runMutation(
      internal.studio.jobMutations.writtenQuestions.updateWrittenQuestionsStatus,
      {
        writtenQuestionId,
        status: "generating",
        metadata: {
          phase: "selecting",
          progress: 70,
          currentStep: "Selecting best questions...",
        },
      }
    );

    const dedupedQuestions = dedupeQuestions(allQuestions);
    console.log(
      `[WrittenQuestionsJob] ${allQuestions.length} questions collapsed to ${dedupedQuestions.length} after heuristic dedupe`
    );

    let finalQuestions: WrittenQuestion[];
    let reduceUsage: TokenUsage | undefined;
    let reduceLatencyMs = 0;

    if (dedupedQuestions.length > questionCount) {
      console.log(
        `[WrittenQuestionsJob] Selecting ${questionCount} best questions from ${dedupedQuestions.length} deduped candidates`
      );

      const structuredSelectLLM = createStructuredLLM<
        z.infer<typeof WrittenQuestionIdSelectionSchema>
      >(WrittenQuestionIdSelectionSchema, {
        model: env.WRITTEN_QUESTIONS_LLM,
        schemaName: "written_question_id_selection",
        maxTokens: 32_000,
        temperature: 0.3,
        reasoningEnabled: false,
        onUsage: (usage) => {
          reduceUsage = addTokenUsage(reduceUsage, usage);
        },
      });
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
      try {
        const selectionResponse = await invokeWithinBudget({
          invoke: () =>
            structuredSelectLLM.invoke([
              new SystemMessage(withLanguageInstruction(REDUCE_SELECT_SYSTEM_PROMPT, language)),
              new HumanMessage(selectionPrompt),
            ]),
          timeoutMs: deadline.stepTimeoutMs(
            CONFIG.REDUCE_TIMEOUT_MS,
            STUDIO_SAVE_RESERVE_MS + CONFIG.CHECK_TIMEOUT_MS
          ),
          phaseLabel: "WrittenQuestionsSelect",
          retry: { maxAttempts: 2, baseDelayMs: 1000 },
        });

        // applySelectedQuestionIds fills gaps from the front of the pool, so check
        // that at least one returned id is real before trusting it.
        const knownIds = new Set(dedupedQuestions.map((q) => q.id));
        if (!selectionResponse.selectedIds.some((id) => knownIds.has(id))) {
          throw new Error("LLM returned zero valid selected question IDs");
        }

        finalQuestions = applySelectedQuestionIds(
          dedupedQuestions,
          selectionResponse.selectedIds,
          questionCount
        );
      } catch (error) {
        // The deduped pool already holds more questions than requested, so a failed
        // or timed-out selection still yields a full set.
        logger.phaseError("selection", error, {
          fallback: "spread_deduped_questions",
          dedupedCount: dedupedQuestions.length,
          targetCount: questionCount,
        });
        finalQuestions = pickSpread(dedupedQuestions, questionCount);
      }

      reduceLatencyMs = Date.now() - startTime;
      console.log(
        `[WrittenQuestionsJob] Selection completed in ${reduceLatencyMs}ms, selected ${finalQuestions.length} questions`
      );
    } else {
      finalQuestions = padQuestionsToTarget(dedupedQuestions, allQuestions, questionCount);
      console.log(
        `[WrittenQuestionsJob] Using ${finalQuestions.length} questions (${dedupedQuestions.length} after dedupe, padded from raw pool of ${allQuestions.length})`
      );
    }

    if (finalQuestions.length < questionCount) {
      finalQuestions = padQuestionsToTarget(finalQuestions, allQuestions, questionCount);
      console.log(
        `[WrittenQuestionsJob] Padded final set to ${finalQuestions.length}/${questionCount} from raw pool`
      );
    }

    const beforeFinalDedupe = finalQuestions.length;
    finalQuestions = dedupeQuestions(finalQuestions);
    if (finalQuestions.length < beforeFinalDedupe) {
      console.log(
        `[WrittenQuestionsJob] Final text dedupe removed ${beforeFinalDedupe - finalQuestions.length} duplicate(s); ${finalQuestions.length} remain`
      );
    }
    if (finalQuestions.length < questionCount) {
      finalQuestions = padQuestionsToTarget(finalQuestions, dedupedQuestions, questionCount);
      console.log(
        `[WrittenQuestionsJob] Re-padded after final dedupe to ${finalQuestions.length}/${questionCount}`
      );
    }

    // Check that each question, model answer and rubric agree before saving (#555).
    const checked = await checkWrittenQuestions({
      questions: finalQuestions,
      pool: dedupedQuestions,
      request: focus ? sanitizeUserInput(focus) : undefined,
      deadline,
      language,
      onUsage: (usage) => {
        reduceUsage = addTokenUsage(reduceUsage, usage);
      },
    });
    finalQuestions = checked.questions;
    console.log(
      `[WrittenQuestionsJob] Answer check: ${checked.fixed} fixed, ${checked.dropped} dropped, ${checked.unchecked} unchecked, ${finalQuestions.length}/${questionCount} kept${checked.fellBack ? " (check dropped everything; kept the selected set)" : ""}`
    );
    if (finalQuestions.length === 0) {
      throw new Error("No questions left after removing answers that show the writer's working");
    }

    // Update status for finalizing
    await ctx.runMutation(
      internal.studio.jobMutations.writtenQuestions.updateWrittenQuestionsStatus,
      {
        writtenQuestionId,
        status: "generating",
        metadata: {
          phase: "finalizing",
          progress: 90,
          currentStep: "Saving results...",
        },
      }
    );

    // Generate title
    let title = "Written Questions";
    if (finalQuestions.length > 0) {
      try {
        const titleContent = finalQuestions
          .map((q) => q.question)
          .join(" ")
          .substring(0, 2000);
        title = await generateTitleWithinDeadline(deadline, titleContent, "WrittenQuestionsTitle");
      } catch (_e) {
        console.log("[WrittenQuestionsJob] Title generation failed, using default");
      }
    }

    // Save results
    await ctx.runMutation(
      internal.studio.jobMutations.writtenQuestions.saveWrittenQuestionsResults,
      {
        writtenQuestionId,
        // Unwrap $ around code and fence unfenced code before the math normalization (#573).
        questions: finalQuestions.map((q) => ({
          ...q,
          question: formatCodeInText(q.question),
          modelAnswer: q.modelAnswer ? formatCodeInText(q.modelAnswer) : q.modelAnswer,
        })),
        metadata: withStudioTelemetryMetadata(
          {
            title,
            questionCount: finalQuestions.length,
            // What the check did, and the count asked for when the set came out short (#555).
            answerCheck: {
              fixed: checked.fixed,
              dropped: checked.dropped,
              unchecked: checked.unchecked,
              fellBack: checked.fellBack,
            },
            ...(finalQuestions.length < questionCount
              ? { requestedQuestionCount: questionCount }
              : {}),
            phase: "completed",
            progress: 100,
            completedAt: Date.now(),
            mapSuccessCount: Object.keys(mapResults).length - failedCount.count,
            mapFailedCount: failedCount.count,
          },
          aggregateStudioJobTelemetry({
            mapResults: Object.values(mapResults),
            ...(reduceLatencyMs > 0 || reduceUsage !== undefined
              ? { reduce: { latencyMs: reduceLatencyMs, tokenUsage: reduceUsage } }
              : {}),
          })
        ),
      }
    );

    // Clear intermediate data
    await ctx.runMutation(
      internal.studio.jobMutations.writtenQuestions.clearWrittenQuestionsMapData,
      { writtenQuestionId }
    );

    // Consume rate limit token on success
    await ctx.runMutation(internal._lib.limits.consumeDailyLimitInternal, {
      userId,
      feature: "writtenQuestion",
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

    await ctx.runMutation(
      internal.studio.jobMutations.writtenQuestions.markWrittenQuestionsFailed,
      {
        writtenQuestionId,
        error: errorMeta.message,
        metadata: {
          phase: "failed",
          errorPhase: "finalization",
          errorType: errorMeta.type,
          retryable: errorMeta.retryable,
          failedAt: Date.now(),
        },
      }
    );

    throw error;
  }
}

// ============================================================
// HELPER: Answer check
// ============================================================

/** Run one check call on a batch; null when it can't run (no time, or the call fails). */
async function checkBatch(
  batch: WrittenQuestion[],
  args: {
    request?: string;
    deadline: JobDeadline;
    language?: string;
    onUsage: (usage: TokenUsage) => void;
  }
): Promise<WrittenQuestionCheck[] | null> {
  const timeoutMs = args.deadline.stepTimeoutMs(CONFIG.CHECK_TIMEOUT_MS, STUDIO_SAVE_RESERVE_MS);
  if (timeoutMs < CONFIG.MIN_CHECK_CALL_MS) {
    console.log(`[WrittenQuestionsJob] Skipping an answer check batch: ${timeoutMs}ms left`);
    return null;
  }
  try {
    const llm = createStructuredLLM<z.infer<typeof WrittenQuestionChecksSchema>>(
      WrittenQuestionChecksSchema,
      {
        model: env.WRITTEN_QUESTIONS_LLM,
        schemaName: "written_question_checks",
        maxTokens: 32_000,
        temperature: 0,
        reasoningEnabled: true,
        onUsage: args.onUsage,
      }
    );
    const response = await invokeWithinBudget({
      invoke: () =>
        llm.invoke([
          new SystemMessage(withLanguageInstruction(CHECK_SYSTEM_PROMPT, args.language)),
          new HumanMessage(getCheckPrompt({ questions: batch, request: args.request })),
        ]),
      timeoutMs,
      phaseLabel: "WrittenQuestionsCheck",
    });
    return response.checks;
  } catch (error) {
    console.warn(
      "[WrittenQuestionsJob] Answer check batch failed:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

export type WrittenQuestionsCheckResult = {
  questions: WrittenQuestion[];
  dropped: number;
  fixed: number;
  /** Questions that couldn't be checked and were kept as they were. */
  unchecked: number;
  /** The check dropped every question, so the selected set was kept (minus answers with working). */
  fellBack: boolean;
};

/**
 * Check that each question, its model answer and its rubric agree, with every calculation
 * recomputed (#555). The map writes questions with the fast model and selection only picks ids,
 * so nothing else catches a rubric that contradicts its answer, wrong arithmetic, a circular
 * question or leftover working ("Wait, let me re-calculate").
 *
 * Questions are checked in batches of CHECK_BATCH_SIZE, run together, so no call outgrows its
 * output budget. Fixable questions come back corrected; each dropped one is replaced by the unused
 * question closest to it in wording (so a topic isn't lost), and replacements are checked in a
 * second round. A selected question that can't be checked is kept unless its answer shows working;
 * an unchecked replacement isn't added. If the check drops everything, the selected set is kept
 * (minus answers with working) rather than failing the job.
 */
export async function checkWrittenQuestions(args: {
  questions: WrittenQuestion[];
  pool: WrittenQuestion[];
  request?: string;
  deadline: JobDeadline;
  language?: string;
  onUsage: (usage: TokenUsage) => void;
}): Promise<WrittenQuestionsCheckResult> {
  const used = new Set(args.questions.map((q) => q.id));
  const spare = args.pool.filter((q) => !used.has(q.id));
  const kept: WrittenQuestion[] = [];
  let dropped = 0;
  let fixed = 0;
  let unchecked = 0;
  let batch = args.questions;

  for (let round = 1; round <= CONFIG.CHECK_ROUNDS && batch.length > 0; round++) {
    const batches: WrittenQuestion[][] = [];
    for (let i = 0; i < batch.length; i += CONFIG.CHECK_BATCH_SIZE) {
      batches.push(batch.slice(i, i + CONFIG.CHECK_BATCH_SIZE));
    }
    const results = await Promise.all(batches.map((b) => checkBatch(b, args)));

    const droppedThisRound: WrittenQuestion[] = [];
    results.forEach((checks, i) => {
      const questions = batches[i];
      if (!checks) {
        // Unchecked: a selected question stays unless its answer shows working; a replacement
        // was never in the selected set, so it isn't added unchecked.
        if (round === 1) {
          const clean = questions.filter((q) => !hasAnswerWorking(q.modelAnswer));
          unchecked += clean.length;
          dropped += questions.length - clean.length;
          kept.push(...clean);
        }
        return;
      }
      const applied = applyQuestionChecks(questions, checks);
      for (const q of applied.dropped) {
        const reason =
          checks.find((c) => c.id === q.id)?.reason ?? "answer shows the writer's working";
        console.log(`[WrittenQuestionsJob] Dropped "${q.question.slice(0, 80)}": ${reason}`);
      }
      kept.push(...applied.kept);
      droppedThisRound.push(...applied.dropped);
      dropped += applied.dropped.length;
      fixed += applied.fixed;
    });
    batch = pickReplacements(droppedThisRound, spare);
  }

  if (kept.length === 0 && args.questions.length > 0) {
    const clean = args.questions.filter((q) => !hasAnswerWorking(q.modelAnswer));
    console.warn(
      `[WrittenQuestionsJob] The answer check dropped every question; keeping ${clean.length} selected questions unchecked`
    );
    return { questions: clean, dropped, fixed, unchecked: clean.length, fellBack: true };
  }
  return { questions: kept, dropped, fixed, unchecked, fellBack: false };
}

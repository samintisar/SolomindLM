"use node";
/**
 * Written questions generation — phase logic.
 * @see ./job.ts for Convex `internalAction` registrations.
 */

import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { packChunks, validateChunks } from "../../_agents/WrittenQuestionsGraph";
import { env } from "../../_lib/env";
import { createJobLogger, createErrorMetadata } from "../../_agents/_shared/logging";
import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  getMapPrompt,
  WrittenQuestionsArraySchema,
  MAP_SYSTEM_PROMPT,
  REDUCE_SELECT_SYSTEM_PROMPT,
  type WrittenQuestion,
  type WrittenQuestionsResponse,
} from "../../_agents/written_questions/prompts";
import {
  applySelectedQuestionIds,
  dedupeQuestions,
  getSelectionIdsPrompt,
} from "../../_agents/written_questions/postprocess";
import { sanitizeUserInput } from "../../_agents/_shared/index";
import { mergeModelKwargs } from "../../_agents/_shared/llm_factory";
import { withLanguageInstruction } from "../../_agents/_shared/languageInstruction";
import { invokeStudioLlm, createLangSmithRunConfig } from "../_job/invokeStudioLlm";

// ============================================================
// SCHEMAS
// ============================================================

// Interface for the structured LLM to avoid deep type instantiation
interface WrittenQuestionsOutputInvoker {
  invoke(
    messages: Array<SystemMessage | HumanMessage>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config?: any
  ): Promise<WrittenQuestionsResponse>;
}

// Helper function to create a structured LLM without triggering deep type instantiation
function createQuestionsLLM(llm: ChatTogetherAI): WrittenQuestionsOutputInvoker {
  return llm.withStructuredOutput(WrittenQuestionsArraySchema, {
    name: "written_questions",
  });
}

const WrittenQuestionIdSelectionSchema = z.object({
  selectedIds: z.array(z.string()),
});

type WrittenQuestionIdSelectionResponse = z.infer<typeof WrittenQuestionIdSelectionSchema>;

interface WrittenQuestionSelectionInvoker {
  invoke(
    messages: Array<SystemMessage | HumanMessage>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config?: any
  ): Promise<WrittenQuestionIdSelectionResponse>;
}

function createQuestionSelectionLLM(llm: ChatTogetherAI): WrittenQuestionSelectionInvoker {
  return llm.withStructuredOutput(WrittenQuestionIdSelectionSchema, {
    name: "written_question_id_selection",
  });
}

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 5_000,
  PER_CHUNK_TIMEOUT_MS: 90_000, // 90 seconds per chunk (under 100s Cloudflare limit)
  REDUCE_TIMEOUT_MS: 300_000, // 5 minutes
  MIN_QUESTIONS_PER_CHUNK: 2,
  MAX_QUESTIONS_PER_CHUNK: 30,
  BUFFER_MULTIPLIER: 2.0,
} as const;

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
// HELPER: Create structured LLM for map phase
// ============================================================

function createMapLLM(): ChatTogetherAI {
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model: env.FAST_LLM,
    temperature: 0.4,
    timeout: CONFIG.PER_CHUNK_TIMEOUT_MS,
    modelKwargs: mergeModelKwargs(env.FAST_LLM, "fast"),
    maxTokens: 8000,
  });
}

function createReduceLLM(): ChatTogetherAI {
  const model = env.WRITTEN_QUESTIONS_LLM;
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model,
    temperature: 0.3,
    timeout: CONFIG.REDUCE_TIMEOUT_MS,
    maxTokens: 32_000,
    modelKwargs: mergeModelKwargs(model, "smart"),
  });
}

// ============================================================
// PHASE 1: Initialize & Schedule Map Tasks
// ============================================================

export async function runWrittenQuestionsGenerationPhase(
  ctx: ActionCtx,
  args: WrittenQuestionsGenerationPhaseArgs
): Promise<void> {
  "use node";

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
    const chunkObjects = await ctx.runAction(internal.documents.index.fetchChunks, {
      documentIds,
    });

    // Extract content from chunk objects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawChunks = chunkObjects.map((chunk: any) => chunk.content);

    logger.phaseComplete("loading_documents", { chunkCount: rawChunks.length });

    // Validate and pack chunks
    const validatedChunks = validateChunks(rawChunks);
    const packedChunks = packChunks(validatedChunks, CONFIG.MAP_CHUNK_SIZE_TOKENS);

    console.log(
      `[WrittenQuestionsJob] Packed ${rawChunks.length} chunks into ${packedChunks.length} map tasks`
    );

    if (packedChunks.length === 0) {
      throw new Error("No valid chunks to process");
    }

    // Calculate questions per chunk
    const questionsPerChunk = Math.max(
      CONFIG.MIN_QUESTIONS_PER_CHUNK,
      Math.min(
        CONFIG.MAX_QUESTIONS_PER_CHUNK,
        Math.ceil((questionCount / packedChunks.length) * CONFIG.BUFFER_MULTIPLIER)
      )
    );

    console.log(`[WrittenQuestionsJob] Questions per chunk: ${questionsPerChunk}`);

    // Initialize map phase metadata
    await ctx.runMutation(
      internal.studio.jobMutations.writtenQuestions.initWrittenQuestionsMapPhase,
      {
        writtenQuestionId,
        totalMapTasks: packedChunks.length,
        questionCount,
        difficulty,
        questionType: questionType === "short" || questionType === "essay" ? questionType : "short",
        focus,
      }
    );

    // Schedule each map task as a separate action
    for (let i = 0; i < packedChunks.length; i++) {
      await ctx.scheduler.runAfter(
        0,
        internal.studio.writtenQuestions.job.processWrittenQuestionsMapChunk,
        {
          writtenQuestionId,
          userId,
          notebookId,
          chunkIndex: i,
          totalChunks: packedChunks.length,
          chunk: packedChunks[i],
          questionCount,
          questionsPerChunk,
          difficulty,
          questionType:
            questionType === "short" || questionType === "essay" ? questionType : "short",
          focus,
        }
      );
      console.log(`[WrittenQuestionsJob] Scheduled map task ${i + 1}/${packedChunks.length}`);
    }

    logger.info("Map phase initialized", {
      totalMapTasks: packedChunks.length,
      chunkSizes: packedChunks.map((c) => c.length),
      questionsPerChunk,
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
  "use node";

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
      userPrefs = await ctx.runQuery(
        internal.userPreferences.index.getPreferencesByUserId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { userId: userId as any }
      );
    } catch (e) {
      console.warn(
        "[writtenQuestions] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

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
    const response = await invokeStudioLlm({
      invoke: () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (structuredLLM as any).invoke(
          [
            new SystemMessage(withLanguageInstruction(MAP_SYSTEM_PROMPT, language)),
            new HumanMessage(prompt),
          ],
          createLangSmithRunConfig({
            runName: "WrittenQuestionsJob.MapProcess",
            tags: ["agent", "written_questions", "map"],
            metadata: {
              chunkIndex,
              questionsPerChunk,
              difficulty,
              questionType,
            },
          })
        ),
      timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
      phaseLabel: "WrittenQuestionsMap",
      onRetry: (attempt, error) => {
        console.log(
          `[WrittenQuestionsJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`
        );
      },
    });

    const elapsed = Date.now() - startTime;
    console.log(`[WrittenQuestionsJob] ${chunkId} LLM completed in ${elapsed}ms`);

    // Assign fresh IDs per question so IDs are unique across parallel map chunks (models often repeat schemes like "1"–"5").
    // Filter out empty or invalid questions.
    const questions = (response as WrittenQuestionsResponse).questions
      .filter(
        (q) =>
          q.question &&
          q.question.trim().length > 0 &&
          q.modelAnswer &&
          q.modelAnswer.trim().length > 0
      )
      .map((q) => ({
        ...q,
        id: randomUUID(),
      }));
    const result = {
      questions,
      processingTimeMs: elapsed,
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
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.values(writtenQuestion.metadata.mapResults).filter((r: any) => {
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
  "use node";

  const { writtenQuestionId, userId, notebookId, questionCount, difficulty, questionType, focus } =
    args;

  const logger = createJobLogger({
    jobType: "written_questions",
    jobId: writtenQuestionId,
    notebookId,
    userId,
  });

  logger.info("Starting finalization phase");

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
      userPrefs = await ctx.runQuery(
        internal.userPreferences.index.getPreferencesByUserId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { userId: userId as any }
      );
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

    if (dedupedQuestions.length > questionCount) {
      console.log(
        `[WrittenQuestionsJob] Selecting ${questionCount} best questions from ${dedupedQuestions.length} deduped candidates`
      );

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
      const selectionResponse = await invokeStudioLlm({
        invoke: () =>
          structuredSelectLLM.invoke(
            [
              new SystemMessage(withLanguageInstruction(REDUCE_SELECT_SYSTEM_PROMPT, language)),
              new HumanMessage(selectionPrompt),
            ],
            createLangSmithRunConfig({
              runName: "WrittenQuestionsJob.Select",
              tags: ["agent", "written_questions", "select"],
              metadata: {
                inputQuestions: dedupedQuestions.length,
                targetCount: questionCount,
                difficulty,
                questionType,
                focus: sanitizedFocus || "none",
              },
            })
          ),
        timeoutMs: CONFIG.REDUCE_TIMEOUT_MS,
        phaseLabel: "WrittenQuestionsSelect",
        retry: { maxAttempts: 2, baseDelayMs: 1000 },
      });

      finalQuestions = applySelectedQuestionIds(
        dedupedQuestions,
        selectionResponse.selectedIds,
        questionCount
      );

      if (finalQuestions.length === 0) {
        throw new Error("LLM returned zero valid selected question IDs");
      }

      console.log(
        `[WrittenQuestionsJob] Selection completed in ${Date.now() - startTime}ms, selected ${finalQuestions.length} questions`
      );
    } else {
      finalQuestions = dedupedQuestions;
      console.log(
        `[WrittenQuestionsJob] Using all ${finalQuestions.length} deduped questions (within limit)`
      );
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
        title = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
          chunk: titleContent,
        });
      } catch (_e) {
        console.log("[WrittenQuestionsJob] Title generation failed, using default");
      }
    }

    // Save results
    await ctx.runMutation(
      internal.studio.jobMutations.writtenQuestions.saveWrittenQuestionsResults,
      {
        writtenQuestionId,
        questions: finalQuestions,
        metadata: {
          title,
          questionCount: finalQuestions.length,
          phase: "completed",
          progress: 100,
          completedAt: Date.now(),
          mapSuccessCount: Object.keys(mapResults).length - failedCount.count,
          mapFailedCount: failedCount.count,
        },
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

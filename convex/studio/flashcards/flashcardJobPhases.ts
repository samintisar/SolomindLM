"use node";
/**
 * Flashcard generation — phase logic.
 * @see ./job.ts for Convex `internalAction` registrations.
 */

import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { packChunks, validateChunks } from "../../_agents/FlashcardGraph";
import {
  recursiveCollapse,
  refineFlashcardSelection,
} from "../../_agents/flashcard/collapseReduceLlm";
import { FLASHCARD_CONFIG } from "../../_agents/flashcard/config";
import {
  groupFlashcardsByTopic,
  heuristicDedupeFlashcards,
  validateSelfContained,
} from "../../_agents/flashcard/flashcardHeuristics";
import { formatFlashcardsAsText } from "../../_agents/flashcard/formatFlashcards";
import { createStructuredLLM } from "../../_agents/flashcard/structuredLlm";
import { cleanBackText, cleanFrontText } from "../../_agents/flashcard/textCleanup";
import { env } from "../../_lib/env";
import { createJobLogger, createErrorMetadata } from "../../_agents/_shared/logging";
import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { MAP_SYSTEM_PROMPT, getMapPrompt } from "../../_agents/flashcard/prompts";
import {
  FlashcardArraySchema,
  type Flashcard,
  type FlashcardResponse,
} from "../../_agents/flashcard/prompts";
import { countTokens, sanitizeUserInput } from "../../_agents/_shared/index";
import { mergeModelKwargs } from "../../_agents/_shared/llm_factory";
import { withLanguageInstruction } from "../../_agents/_shared/languageInstruction";
import { invokeStudioLlm, createLangSmithRunConfig } from "../_job/invokeStudioLlm";

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.FLASHCARD_MAP_CHUNK_TOKENS, 10),
  PER_CHUNK_TIMEOUT_MS: 90000, // 90 seconds per chunk (under 100s Cloudflare limit)
  REDUCE_TIMEOUT_MS: FLASHCARD_CONFIG.REDUCE_TIMEOUT_MS,
  REDUCE_MAX_TOKENS: FLASHCARD_CONFIG.REDUCE_MAX_TOKENS,
  MIN_CARDS_PER_CHUNK: 2,
  BUFFER_MULTIPLIER: 1.5,
  MAX_CARDS_PER_CHUNK: 30,
} as const;

export type FlashcardGenerationPhaseArgs = {
  flashcardId: Id<"flashcards">;
  userId: string;
  notebookId: Id<"notebooks">;
  documentIds: Id<"documents">[];
  cardCount: number;
  difficulty: string;
  topic?: string;
  smartLlm?: string;
};

export type ProcessFlashcardMapChunkPhaseArgs = {
  flashcardId: Id<"flashcards">;
  userId: string;
  notebookId: Id<"notebooks">;
  chunkIndex: number;
  totalChunks: number;
  chunk: string;
  cardCount: number;
  cardsPerChunk: number;
  difficulty: string;
  topic?: string;
  smartLlm?: string;
};

export type FinalizeFlashcardPhaseArgs = {
  flashcardId: Id<"flashcards">;
  userId: string;
  notebookId: Id<"notebooks">;
  cardCount: number;
  difficulty: string;
  topic?: string;
  smartLlm?: string;
};

// ============================================================
// HELPER: Create structured LLM for map phase
// ============================================================

function createMapLLM(): ChatTogetherAI {
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model: env.FAST_LLM,
    temperature: 0.3,
    timeout: CONFIG.PER_CHUNK_TIMEOUT_MS,
    modelKwargs: mergeModelKwargs(env.FAST_LLM, "fast"),
  });
}

function createReduceLLM(modelOverride?: string): ChatTogetherAI {
  const model = modelOverride || env.FLASHCARDS_LLM;
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model,
    temperature: 0.3,
    timeout: CONFIG.REDUCE_TIMEOUT_MS,
    maxTokens: CONFIG.REDUCE_MAX_TOKENS,
    modelKwargs: mergeModelKwargs(model, "smart"),
  });
}

// ============================================================
// PHASE 1: Initialize & Schedule Map Tasks
// ============================================================

export async function runFlashcardGenerationPhase(
  ctx: ActionCtx,
  args: FlashcardGenerationPhaseArgs
): Promise<void> {
  "use node";

  const { flashcardId, userId, notebookId, documentIds, cardCount, difficulty, topic, smartLlm } = args;

  // Initialize structured logger
  const logger = createJobLogger({
    jobType: "flashcard",
    jobId: flashcardId,
    notebookId,
    userId,
  });

  logger.jobStart({
    cardCount,
    difficulty,
    topic,
    docCount: documentIds.length,
  });

  try {
    // Phase: Initializing
    logger.phaseStart("initializing", { progress: 5 });
    await ctx.runMutation(internal.studio.jobMutations.flashcards.updateFlashcardStatus, {
      flashcardId,
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
    await ctx.runMutation(internal.studio.jobMutations.flashcards.updateFlashcardStatus, {
      flashcardId,
      status: "generating",
      metadata: {
        phase: "loading_documents",
        progress: 15,
        currentStep: "Loading documents...",
      },
    });

    // Get document chunks
    const chunkObjects = await ctx.runAction(internal.documents.index.fetchChunks, {
      documentIds,
    });

    // Extract content from chunk objects
    const rawChunks = chunkObjects.map((chunk: any) => chunk.content);

    logger.phaseComplete("loading_documents", { chunkCount: rawChunks.length });

    // Validate and pack chunks
    const validatedChunks = validateChunks(rawChunks);
    const packedChunks = packChunks(validatedChunks, CONFIG.MAP_CHUNK_SIZE_TOKENS);

    console.log(
      `[FlashcardJob] Packed ${rawChunks.length} chunks into ${packedChunks.length} map tasks`
    );

    if (packedChunks.length === 0) {
      throw new Error("No valid chunks to process");
    }

    // Calculate cards per chunk
    const cardsPerChunk = Math.max(
      CONFIG.MIN_CARDS_PER_CHUNK,
      Math.min(
        CONFIG.MAX_CARDS_PER_CHUNK,
        Math.ceil((cardCount / packedChunks.length) * CONFIG.BUFFER_MULTIPLIER)
      )
    );

    console.log(`[FlashcardJob] Cards per chunk: ${cardsPerChunk}`);

    // Initialize map phase metadata
    await ctx.runMutation(internal.studio.jobMutations.flashcards.initFlashcardMapPhase, {
      flashcardId,
      totalMapTasks: packedChunks.length,
      cardCount,
      difficulty,
      topic,
    });

    // Schedule each map task as a separate action
    for (let i = 0; i < packedChunks.length; i++) {
      await ctx.scheduler.runAfter(0, internal.studio.flashcards.job.processFlashcardMapChunk, {
        flashcardId,
        userId,
        notebookId,
        chunkIndex: i,
        totalChunks: packedChunks.length,
        chunk: packedChunks[i],
        cardCount,
        cardsPerChunk,
        difficulty,
        topic,
        smartLlm,
      });
      console.log(`[FlashcardJob] Scheduled map task ${i + 1}/${packedChunks.length}`);
    }

    logger.info("Map phase initialized", {
      totalMapTasks: packedChunks.length,
      chunkSizes: packedChunks.map((c) => c.length),
      cardsPerChunk,
    });
  } catch (error) {
    const errorMeta = createErrorMetadata(error, "initializing");

    logger.jobError(error, {
      phase: "initializing",
      errorType: errorMeta.type,
      retryable: errorMeta.retryable,
    });

    await ctx.runMutation(internal.studio.jobMutations.flashcards.markFlashcardFailed, {
      flashcardId,
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

export async function runProcessFlashcardMapChunkPhase(
  ctx: ActionCtx,
  args: ProcessFlashcardMapChunkPhaseArgs
): Promise<void> {
  "use node";

  const {
    flashcardId,
    userId,
    notebookId,
    chunkIndex,
    totalChunks,
    chunk,
    cardCount,
    cardsPerChunk,
    difficulty,
    topic,
    smartLlm,
  } = args;

  const logger = createJobLogger({
    jobType: "flashcard",
    jobId: flashcardId,
    notebookId,
    userId,
  });

  const chunkId = `[Chunk ${chunkIndex + 1}/${totalChunks}]`;
  console.log(`[FlashcardJob] ${chunkId} Starting map processing`);

  try {
    // Check if flashcard still exists
    const flashcard = await ctx.runQuery(internal.studio.flashcards.index.getInternal, {
      id: flashcardId,
    });
    if (!flashcard) {
      console.log(`[FlashcardJob] ${chunkId} Flashcard deleted, skipping`);
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(
        internal.userPreferences.index.getPreferencesByUserId,
        { userId: userId as any },
      );
    } catch (e) {
      console.warn("[flashcard] user preference fetch failed, using default language", e instanceof Error ? e.message : String(e));
    }
    const language = userPrefs?.outputLanguage;

    // Process with LLM using structured output
    const llm = createMapLLM();
    const structuredLLM = createStructuredLLM(llm, FlashcardArraySchema);

    const sanitizedTopic = topic ? sanitizeUserInput(topic) : undefined;
    const prompt = getMapPrompt({
      chunk,
      cardCount,
      cardsPerChunk,
      difficulty,
      topic: sanitizedTopic,
    });

    console.log(`[FlashcardJob] ${chunkId} Calling LLM (${prompt.length} chars)`);

    const startTime = Date.now();
    const response = await invokeStudioLlm({
      invoke: () =>
        (structuredLLM as any).invoke(
          [new SystemMessage(withLanguageInstruction(MAP_SYSTEM_PROMPT, language)), new HumanMessage(prompt)],
          createLangSmithRunConfig({
            runName: "FlashcardJob.MapProcess",
            tags: ["agent", "flashcard", "map"],
            metadata: {
              chunkIndex,
              cardCount,
              difficulty,
              topic: topic || "none",
            },
          })
        ),
      timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
      phaseLabel: "FlashcardMap",
      onRetry: (attempt, error) => {
        console.log(`[FlashcardJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`);
      },
    });

    const elapsed = Date.now() - startTime;
    console.log(`[FlashcardJob] ${chunkId} LLM completed in ${elapsed}ms`);

    // Clean flashcard text
    const flashcards = (response as FlashcardResponse).flashcards;
    const cleanedFlashcards = flashcards.map((card: Flashcard) => ({
      front: cleanFrontText(card.front),
      back: cleanBackText(card.back),
      topic: card.topic,
    }));

    // Store result
    const result = {
      flashcards: cleanedFlashcards,
      processingTimeMs: elapsed,
    };

    await ctx.runMutation(internal.studio.jobMutations.flashcards.storeFlashcardMapResult, {
      flashcardId,
      chunkIndex,
      result: JSON.stringify(result),
    });

    logger.info(`Map chunk completed`, {
      chunkIndex,
      elapsed,
      flashcardsGenerated: cleanedFlashcards.length,
    });

    // Check if all maps are complete
    const updatedFlashcard = await ctx.runQuery(internal.studio.flashcards.index.getInternal, {
      id: flashcardId,
    });
    if (!updatedFlashcard) return;

    const completedMaps = updatedFlashcard.metadata?.mapResults
      ? Object.keys(updatedFlashcard.metadata.mapResults).length
      : 0;
    const totalMaps = updatedFlashcard.metadata?.totalMapTasks || totalChunks;

    console.log(`[FlashcardJob] Map progress: ${completedMaps}/${totalMaps}`);

    if (completedMaps >= totalMaps) {
      console.log(`[FlashcardJob] All map tasks complete, scheduling finalization`);
      await ctx.scheduler.runAfter(0, internal.studio.flashcards.job.finalizeFlashcardPhase, {
        flashcardId,
        userId,
        notebookId,
        cardCount,
        difficulty,
        topic,
        smartLlm,
      });
    }
  } catch (error) {
    const errorMeta = createErrorMetadata(error, "map_processing");

    console.error(`[FlashcardJob] ${chunkId} FAILED:`, errorMeta.message);

    // Store error result
    await ctx.runMutation(internal.studio.jobMutations.flashcards.storeFlashcardMapResult, {
      flashcardId,
      chunkIndex,
      result: JSON.stringify({
        _error: true,
        errorMessage: errorMeta.message,
        isTimeout: errorMeta.type === "llm_timeout",
        flashcards: [],
      }),
    });

    logger.warn(`Map chunk failed`, {
      chunkIndex,
      error: errorMeta.message,
      errorType: errorMeta.type,
    });

    // Check if we should still proceed with partial results
    const flashcard = await ctx.runQuery(internal.studio.flashcards.index.getInternal, {
      id: flashcardId,
    });
    if (!flashcard) return;

    const completedMaps = flashcard.metadata?.mapResults
      ? Object.keys(flashcard.metadata.mapResults).length
      : 0;
    const totalMaps = flashcard.metadata?.totalMapTasks || totalChunks;
    const failedMaps = flashcard.metadata?.mapResults
      ? Object.values(flashcard.metadata.mapResults).filter((r: any) => {
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
      console.log(`[FlashcardJob] All tasks done. Success: ${successCount}/${totalMaps}`);

      if (successCount > 0) {
        await ctx.scheduler.runAfter(0, internal.studio.flashcards.job.finalizeFlashcardPhase, {
          flashcardId,
          userId,
          notebookId,
          cardCount,
          difficulty,
          topic,
          smartLlm,
        });
      } else {
        await ctx.runMutation(internal.studio.jobMutations.flashcards.markFlashcardFailed, {
          flashcardId,
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
// PHASE 3: Finalize (Reduce + Save)
// ============================================================

export async function runFinalizeFlashcardPhase(
  ctx: ActionCtx,
  args: FinalizeFlashcardPhaseArgs
): Promise<void> {
  "use node";

  const { flashcardId, userId, notebookId, cardCount, difficulty, topic, smartLlm } = args;

  const logger = createJobLogger({
    jobType: "flashcard",
    jobId: flashcardId,
    notebookId,
    userId,
  });

  logger.info("Starting finalization phase");

  try {
    // Get flashcard with map results
    const flashcard = await ctx.runQuery(internal.studio.flashcards.index.getInternal, {
      id: flashcardId,
    });
    if (!flashcard) {
      console.log("[FlashcardJob] Flashcard deleted during finalization");
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(
        internal.userPreferences.index.getPreferencesByUserId,
        { userId: userId as any },
      );
    } catch (e) {
      console.warn("[flashcard] user preference fetch failed, using default language", e instanceof Error ? e.message : String(e));
    }
    const language = userPrefs?.outputLanguage;

    const mapResults = (flashcard.metadata?.mapResults as Record<string, string>) || {};

    // Separate successful and failed results
    const mapFlashcardGroups: Flashcard[][] = [];
    const allFlashcards: Flashcard[] = [];
    const failedCount = { count: 0 };

    for (const [_idx, resultJson] of Object.entries(mapResults)) {
      try {
        const parsed = JSON.parse(resultJson);
        if (parsed._error) {
          failedCount.count++;
        } else if (parsed.flashcards && Array.isArray(parsed.flashcards)) {
          mapFlashcardGroups.push(parsed.flashcards);
          allFlashcards.push(...parsed.flashcards);
        }
      } catch {
        failedCount.count++;
      }
    }

    console.log(
      `[FlashcardJob] Finalization: ${allFlashcards.length} flashcards collected, ${failedCount.count} failed chunks`
    );

    if (allFlashcards.length === 0) {
      throw new Error("No successful flashcards generated from any chunk");
    }

    // Update status
    await ctx.runMutation(internal.studio.jobMutations.flashcards.updateFlashcardStatus, {
      flashcardId,
      status: "generating",
      metadata: {
        phase: "reducing",
        progress: 70,
        currentStep: "Selecting best flashcards...",
      },
    });

    // Collapse and reduce with the shared flashcard pipeline helpers
    const sanitizedTopic = topic ? sanitizeUserInput(topic) : undefined;
    const llm = createReduceLLM(smartLlm);
    const collapseReduceDeps = {
      smartLlm: llm,
      estimateTokens: countTokens,
      logger,
    };

    const startTime = Date.now();
    const collapsedOutputs = await recursiveCollapse(
      mapFlashcardGroups,
      collapseReduceDeps,
      sanitizedTopic,
      language
    );

    const collapsedFlashcards = collapsedOutputs
      .flat()
      .filter((card) => card.front && card.back && validateSelfContained(card));

    if (collapsedFlashcards.length === 0) {
      throw new Error("No valid flashcards remained after collapse");
    }

    const { dedupedFlashcards, duplicatesRemoved } = heuristicDedupeFlashcards(collapsedFlashcards);
    const nearTargetUpperBound = Math.max(cardCount + 2, Math.ceil(cardCount * 1.2));
    const shouldSkipSmartSelection =
      dedupedFlashcards.length <= nearTargetUpperBound &&
      (dedupedFlashcards.length <= cardCount || duplicatesRemoved <= 1);

    let finalFlashcards: Flashcard[];
    if (shouldSkipSmartSelection) {
      finalFlashcards = dedupedFlashcards.slice(0, cardCount);
      console.log(
        `[FlashcardJob] Skipping smart reduce: ${dedupedFlashcards.length} deduped cards already near target ${cardCount}`
      );
    } else {
      finalFlashcards = await refineFlashcardSelection(
        dedupedFlashcards,
        cardCount,
        difficulty,
        collapseReduceDeps,
        sanitizedTopic,
        language
      );
    }

    const elapsed = Date.now() - startTime;
    const topicDistribution = groupFlashcardsByTopic(finalFlashcards);

    console.log(
      `[FlashcardJob] Reduce completed in ${elapsed}ms, output: ${finalFlashcards.length} cards`
    );
    console.log(`[FlashcardJob] Reduce distribution: ${JSON.stringify(topicDistribution)}`);

    // Generate title
    const flashcardsText = formatFlashcardsAsText(finalFlashcards);
    let title = "Flashcards";
    try {
      title = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
        chunk: flashcardsText.substring(0, 2000),
      });
    } catch (_e) {
      console.log("[FlashcardJob] Title generation failed, using default");
    }

    // Save results
    await ctx.runMutation(internal.studio.jobMutations.flashcards.saveFlashcardResults, {
      flashcardId,
      flashcards: finalFlashcards,
      metadata: {
        title,
        cardCount: finalFlashcards.length,
        phase: "completed",
        progress: 100,
        completedAt: Date.now(),
        mapSuccessCount: Object.keys(mapResults).length - failedCount.count,
        mapFailedCount: failedCount.count,
      },
    });

    // Clear intermediate data
    await ctx.runMutation(internal.studio.jobMutations.flashcards.clearFlashcardMapData, {
      flashcardId,
    });

    logger.jobComplete({
      cardsGenerated: finalFlashcards.length,
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

    await ctx.runMutation(internal.studio.jobMutations.flashcards.markFlashcardFailed, {
      flashcardId,
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

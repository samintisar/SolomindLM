"use node";

/**
 * Audio overview generation — phase logic.
 * @see ./job.ts for Convex `internalAction` registrations.
 */

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { packChunks, sanitizeUserInput, validateChunks } from "../../_agents/_shared/index";
import { withLanguageInstruction } from "../../_agents/_shared/languageInstruction";
import { EmptyLlmResponseError } from "../../_agents/_shared/llmErrors";
import { createErrorMetadata, createJobLogger } from "../../_agents/_shared/logging";
import { isRetryableError } from "../../_agents/_shared/retry";
import { planStudioJobMapPhase } from "../../_agents/_shared/studioExecutionMode";
import {
  aggregateStudioJobTelemetry,
  withStudioTelemetryMetadata,
} from "../../_agents/_shared/studioJobTelemetry";
import { invokeTogetherText } from "../../_agents/_shared/studioTextLlm";
import { countTokens } from "../../_agents/_shared/tokenizer";
import { addTokenUsage, type TokenUsage } from "../../_agents/_shared/usageAggregate";
import {
  type AudioLength,
  type AudioType,
  getMapPrompt,
  getReducePrompt,
  MAP_SYSTEM_PROMPT,
  REDUCE_SYSTEM_PROMPT,
  TARGET_LINE_COUNTS,
} from "../../_agents/audio_overview/prompts";
import {
  generateValidatedDialogueScript,
  getMinimumDialogueLines,
} from "../../_agents/audio_overview/scriptParsing";
import type { DialogueLine } from "../../_agents/audio_overview/state";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { env } from "../../_lib/env";
import { concatenateMp3Buffers, encodePcmWavToMp3 } from "../../_services/ai/mp3.js";
import {
  createTogetherTtsClient,
  synthesizeSpeechToBuffer,
} from "../../_services/ai/togetherTts.js";
import { concatenateWavBuffers } from "../../_services/ai/wav.js";
import { collapseStringOutputsByTokens } from "../_job/collapseStringOutputsByTokens";
import { invokeStudioLlm } from "../_job/invokeStudioLlm";
import type { AudioSynthesisInput, AudioSynthesisState } from "../jobMutations/audio";
import { planSynthesisChunks } from "./synthesisChunks";

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 20_000,
  REDUCE_CHUNK_SIZE_TOKENS: 40_000,
  PER_CHUNK_TIMEOUT_MS: 90_000, // 90 seconds per chunk
  REDUCE_TIMEOUT_MS: 600_000, // 10 minutes
  REDUCE_MAX_OUTPUT_TOKENS: 16_384,
  /**
   * Script writing runs with reasoning off. The smart model thinks by default and its reasoning
   * shares `max_tokens` with the answer; on a ~220-line script it often spent the whole budget
   * thinking and returned no script (finish_reason=length, #198).
   */
  REDUCE_REASONING_ENABLED: false,
  TTS_TIMEOUT_MS: 300_000, // 5 minutes
  /** Lines each synthesis chunk sends to TTS at once. */
  TTS_BATCH_SIZE: 5,
  /** Delay before a failed synthesis chunk's one retry. */
  SYNTHESIS_CHUNK_RETRY_DELAY_MS: 5_000,
} as const;

export type AudioOverviewGenerationPhaseArgs = {
  audioOverviewId: Id<"audioOverviews">;
  userId: string;
  notebookId: Id<"notebooks">;
  documentIds: Id<"documents">[];
};

export type ProcessAudioMapChunkPhaseArgs = {
  audioOverviewId: Id<"audioOverviews">;
  userId: string;
  notebookId: Id<"notebooks">;
  chunkIndex: number;
  totalChunks: number;
  chunk: string;
};

export type FinalizeAudioOverviewPhaseArgs = {
  audioOverviewId: Id<"audioOverviews">;
  userId: string;
  notebookId: Id<"notebooks">;
};

export type SynthesizeAudioOverviewPhaseArgs = FinalizeAudioOverviewPhaseArgs;

export type SynthesizeAudioOverviewChunkPhaseArgs = SynthesizeAudioOverviewPhaseArgs & {
  chunkIndex: number;
  /** 0 on the first run, 1 on the retry. */
  attempt: number;
};

/** Kokoro (or other Together TTS) voice IDs per host */
const VOICES = {
  host_a: env.AUDIO_VOICE_HOST_A,
  host_b: env.AUDIO_VOICE_HOST_B,
} as const;

// ============================================================
// HELPER: Create LLMs
// ============================================================

// ============================================================
// PHASE 1: Initialize & Schedule Map Tasks
// ============================================================

export async function runAudioOverviewGenerationPhase(
  ctx: ActionCtx,
  args: AudioOverviewGenerationPhaseArgs
): Promise<void> {
  "use node";

  const { audioOverviewId, userId, notebookId, documentIds } = args;

  // Initialize structured logger
  const logger = createJobLogger({
    jobType: "audio",
    jobId: audioOverviewId,
    notebookId,
    userId,
  });

  logger.jobStart({
    docCount: documentIds.length,
  });

  try {
    // Phase: Initializing
    logger.phaseStart("initializing", { progress: 5 });
    await ctx.runMutation(internal.studio.jobMutations.audio.updateAudioOverviewStatus, {
      audioOverviewId,
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
    await ctx.runMutation(internal.studio.jobMutations.audio.updateAudioOverviewStatus, {
      audioOverviewId,
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
    });

    // Extract content from chunk objects
    const rawChunks = chunkObjects.map((chunk: any) => chunk.content);

    logger.phaseComplete("loading_documents", { chunkCount: rawChunks.length });

    // Validate and pack chunks
    const validatedChunks = validateChunks(rawChunks, {
      targetSize: CONFIG.MAP_CHUNK_SIZE_TOKENS,
      minChunkLength: 50,
      maxChunkLength: 50000,
      agentName: "AudioOverviewJob",
    });
    const mapPlan = planStudioJobMapPhase({
      documentCount: documentIds.length,
      chunks: validatedChunks,
      estimateTokens: countTokens,
      pack: (chunks) =>
        packChunks(chunks, {
          targetSize: CONFIG.MAP_CHUNK_SIZE_TOKENS,
          minChunkLength: 50,
          maxChunkLength: 50000,
          agentName: "AudioOverviewJob",
        }),
    });

    console.log(
      `[AudioJob] Planned ${validatedChunks.length} validated chunks into ${mapPlan.mapChunks.length} map tasks (${mapPlan.mode})`
    );

    const scheduledChunks = mapPlan.skipMapContent ? [mapPlan.skipMapContent] : mapPlan.mapChunks;

    if (scheduledChunks.length === 0) {
      throw new Error("No valid chunks to process");
    }

    // Initialize map phase metadata
    await ctx.runMutation(internal.studio.jobMutations.audio.initAudioOverviewMapPhase, {
      audioOverviewId,
      totalMapTasks: scheduledChunks.length,
    });

    // Schedule each map task as a separate action
    for (let i = 0; i < scheduledChunks.length; i++) {
      await ctx.scheduler.runAfter(0, internal.studio.audio.job.processAudioMapChunk, {
        audioOverviewId,
        userId,
        notebookId,
        chunkIndex: i,
        totalChunks: scheduledChunks.length,
        chunk: scheduledChunks[i],
      });
      console.log(`[AudioJob] Scheduled map task ${i + 1}/${scheduledChunks.length}`);
    }

    logger.info("Map phase initialized", {
      totalMapTasks: scheduledChunks.length,
      executionMode: mapPlan.mode,
      chunkSizes: scheduledChunks.map((c) => c.length),
    });
  } catch (error) {
    const errorMeta = createErrorMetadata(error, "initializing");

    logger.jobError(error, {
      phase: "initializing",
      errorType: errorMeta.type,
      retryable: errorMeta.retryable,
    });

    await ctx.runMutation(internal.studio.jobMutations.audio.markAudioOverviewFailed, {
      audioOverviewId,
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

export async function runProcessAudioMapChunkPhase(
  ctx: ActionCtx,
  args: ProcessAudioMapChunkPhaseArgs
): Promise<void> {
  "use node";

  const { audioOverviewId, userId, notebookId, chunkIndex, totalChunks, chunk } = args;

  const logger = createJobLogger({
    jobType: "audio",
    jobId: audioOverviewId,
    notebookId,
    userId,
  });

  const chunkId = `[Chunk ${chunkIndex + 1}/${totalChunks}]`;
  console.log(`[AudioJob] ${chunkId} Starting map processing`);

  try {
    // Check if audio overview still exists
    const audioOverview = await ctx.runQuery(internal.studio.audio.index.getInternal, {
      id: audioOverviewId,
    });
    if (!audioOverview) {
      console.log(`[AudioJob] ${chunkId} Audio overview deleted, skipping`);
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, {
        userId: userId as any,
      });
    } catch (e) {
      console.warn(
        "[audio] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

    // Process with LLM - extract dialogue beats
    const metadata = (audioOverview.metadata ?? {}) as {
      audioType?: AudioType;
      focus?: string;
    };
    const audioType: AudioType = metadata.audioType || "deep_dive";
    const sanitizedFocus = metadata.focus ? sanitizeUserInput(metadata.focus) : undefined;
    console.log(
      `[AudioJob] ${chunkId} Map config: type=${audioType}, focus=${sanitizedFocus || "none"}`
    );
    const prompt = getMapPrompt(audioType, chunk, sanitizedFocus);

    console.log(`[AudioJob] ${chunkId} Calling LLM (${prompt.length} chars)`);

    const startTime = Date.now();
    let tokenUsage: TokenUsage | undefined;
    const output = await invokeStudioLlm({
      invoke: () =>
        invokeTogetherText({
          systemPrompt: withLanguageInstruction(MAP_SYSTEM_PROMPT, language),
          userPrompt: prompt,
          model: env.FAST_LLM,
          temperature: 0.3,
          onUsage: (usage) => {
            tokenUsage = usage;
          },
        }),
      timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
      phaseLabel: "AudioMap",
      onRetry: (attempt, error) => {
        console.log(`[AudioJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`);
      },
    });

    const elapsed = Date.now() - startTime;

    console.log(`[AudioJob] ${chunkId} LLM completed in ${elapsed}ms`);

    // Store result
    const result = {
      beats: output,
      processingTimeMs: elapsed,
      ...(tokenUsage !== undefined ? { tokenUsage } : {}),
    };

    await ctx.runMutation(internal.studio.jobMutations.audio.storeAudioOverviewMapResult, {
      audioOverviewId,
      chunkIndex,
      result: JSON.stringify(result),
    });

    logger.info(`Map chunk completed`, {
      chunkIndex,
      elapsed,
      outputLength: output.length,
    });

    // Check if all maps are complete
    const updatedAudioOverview = await ctx.runQuery(internal.studio.audio.index.getInternal, {
      id: audioOverviewId,
    });
    if (!updatedAudioOverview) return;

    const completedMaps = updatedAudioOverview.metadata?.mapResults
      ? Object.keys(updatedAudioOverview.metadata.mapResults).length
      : 0;
    const totalMaps = updatedAudioOverview.metadata?.totalMapTasks || totalChunks;

    console.log(`[AudioJob] Map progress: ${completedMaps}/${totalMaps}`);

    if (completedMaps >= totalMaps) {
      console.log(`[AudioJob] All map tasks complete, scheduling finalization`);
      await ctx.scheduler.runAfter(0, internal.studio.audio.job.finalizeAudioOverviewPhase, {
        audioOverviewId,
        userId,
        notebookId,
      });
    }
  } catch (error) {
    const errorMeta = createErrorMetadata(error, "map_processing");

    console.error(`[AudioJob] ${chunkId} FAILED:`, errorMeta.message);

    // Store error result
    await ctx.runMutation(internal.studio.jobMutations.audio.storeAudioOverviewMapResult, {
      audioOverviewId,
      chunkIndex,
      result: JSON.stringify({
        _error: true,
        errorMessage: errorMeta.message,
        isTimeout: errorMeta.type === "llm_timeout",
        beats: "",
      }),
    });

    logger.warn(`Map chunk failed`, {
      chunkIndex,
      error: errorMeta.message,
      errorType: errorMeta.type,
    });

    // Check if we should still proceed with partial results
    const audioOverview = await ctx.runQuery(internal.studio.audio.index.getInternal, {
      id: audioOverviewId,
    });
    if (!audioOverview) return;

    const completedMaps = audioOverview.metadata?.mapResults
      ? Object.keys(audioOverview.metadata.mapResults).length
      : 0;
    const totalMaps = audioOverview.metadata?.totalMapTasks || totalChunks;
    const failedMaps = audioOverview.metadata?.mapResults
      ? Object.values(audioOverview.metadata.mapResults).filter((r: any) => {
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
      console.log(`[AudioJob] All tasks done. Success: ${successCount}/${totalMaps}`);

      if (successCount > 0) {
        await ctx.scheduler.runAfter(0, internal.studio.audio.job.finalizeAudioOverviewPhase, {
          audioOverviewId,
          userId,
          notebookId,
        });
      } else {
        await ctx.runMutation(internal.studio.jobMutations.audio.markAudioOverviewFailed, {
          audioOverviewId,
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
// PHASE 3: Finalize (Collapse + Write Script, then schedule synthesis)
// ============================================================

export async function runFinalizeAudioOverviewPhase(
  ctx: ActionCtx,
  args: FinalizeAudioOverviewPhaseArgs
): Promise<void> {
  "use node";

  const { audioOverviewId, userId, notebookId } = args;

  const logger = createJobLogger({
    jobType: "audio",
    jobId: audioOverviewId,
    notebookId,
    userId,
  });

  logger.info("Starting finalization phase");

  try {
    // Get audio overview with map results
    const audioOverview = await ctx.runQuery(internal.studio.audio.index.getInternal, {
      id: audioOverviewId,
    });
    if (!audioOverview) {
      console.log("[AudioJob] Audio overview deleted during finalization");
      return;
    }

    let userPrefs: { outputLanguage?: string } | null = null;
    try {
      userPrefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, {
        userId: userId as any,
      });
    } catch (e) {
      console.warn(
        "[audio] user preference fetch failed, using default language",
        e instanceof Error ? e.message : String(e)
      );
    }
    const language = userPrefs?.outputLanguage;

    const mapResults = (audioOverview.metadata?.mapResults as Record<string, string>) || {};

    // Map output is held in memory from here; drop it from the row so the finalize-phase
    // status updates don't rewrite and re-send it.
    await ctx.runMutation(internal.studio.jobMutations.audio.clearAudioOverviewMapData, {
      audioOverviewId,
    });

    // Separate successful and failed results
    const allBeats: string[] = [];
    const failedCount = { count: 0 };

    for (const [_idx, resultJson] of Object.entries(mapResults)) {
      try {
        const parsed = JSON.parse(resultJson);
        if (parsed._error) {
          failedCount.count++;
        } else if (parsed.beats) {
          allBeats.push(parsed.beats);
        }
      } catch {
        failedCount.count++;
      }
    }

    console.log(
      `[AudioJob] Finalization: ${allBeats.length} beat extractions collected, ${failedCount.count} failed chunks`
    );

    if (allBeats.length === 0) {
      throw new Error("No successful beat extractions from any chunk");
    }

    // Update status
    await ctx.runMutation(internal.studio.jobMutations.audio.updateAudioOverviewStatus, {
      audioOverviewId,
      status: "generating",
      metadata: {
        phase: "collapsing",
        progress: 50,
        currentStep: "Consolidating content...",
      },
    });

    // Collapse outputs
    const collapsedOutputs = collapseStringOutputsByTokens(
      allBeats,
      CONFIG.REDUCE_CHUNK_SIZE_TOKENS / 2
    );
    const combined = collapsedOutputs.join("\n\n---\n\n");

    console.log(
      `[AudioJob] Collapsed ${allBeats.length} outputs to ${collapsedOutputs.length} chunks`
    );

    // Update status for script writing
    await ctx.runMutation(internal.studio.jobMutations.audio.updateAudioOverviewStatus, {
      audioOverviewId,
      status: "generating",
      metadata: {
        phase: "writing_script",
        progress: 55,
        currentStep: "Writing dialogue script...",
      },
    });

    // Write dialogue script
    const storedMetadata = (audioOverview.metadata ?? {}) as {
      audioType?: AudioType;
      length?: AudioLength;
      focus?: string;
    };
    const audioType: AudioType = storedMetadata.audioType || "deep_dive";
    const length: AudioLength = storedMetadata.length || "default";
    const sanitizedFocus = storedMetadata.focus
      ? sanitizeUserInput(storedMetadata.focus)
      : undefined;
    const targetLines = TARGET_LINE_COUNTS[length];

    const minimumDialogueLines = getMinimumDialogueLines(targetLines);

    console.log(
      `[AudioJob] Script config: type=${audioType}, length=${length}, targetLines=${targetLines}, minimumLines=${minimumDialogueLines}, focus=${sanitizedFocus || "general overview"}, reduceTimeoutMs=${CONFIG.REDUCE_TIMEOUT_MS}, reduceMaxOutputTokens=${CONFIG.REDUCE_MAX_OUTPUT_TOKENS}, reasoning=${CONFIG.REDUCE_REASONING_ENABLED}`
    );

    const reducePrompt = getReducePrompt({
      content: combined,
      audioType,
      length,
      focus: sanitizedFocus || "general overview",
      targetLines,
    });

    console.log(
      `[AudioJob] Writing script single-pass (promptChars=${reducePrompt.length}, promptTokens=${countTokens(reducePrompt)}, targetLines=${targetLines})`
    );

    // Parse-failure retries are bounded: the first attempt keeps transport retries, a follow-up
    // attempt only runs if the first one finished quickly, so the phase stays well inside the
    // Convex action time limit.
    const REDUCE_MAX_ATTEMPTS = 2;
    const REDUCE_PARSE_RETRY_BUDGET_MS = 180_000;
    const REDUCE_FORMAT_REMINDER =
      "\n\nIMPORTANT: Your previous reply could not be used because it was not a complete, valid JSON array of dialogue lines. Respond with ONLY the JSON array (no commentary, no code fences), make sure every object is complete, and close the array.";
    const REDUCE_LENGTH_REMINDER =
      "\n\nIMPORTANT: Your previous reply was empty because it ran out of output space before any usable script was produced. Respond with ONLY the JSON array (no commentary, no code fences), keep each turn concise so the complete script fits, and close the array.";
    let reduceUsage: TokenUsage | undefined;
    const reduceStartTime = Date.now();

    const { script: fullDialogueScript, attempt: scriptAttempt } =
      await generateValidatedDialogueScript({
        minimumLines: minimumDialogueLines,
        maxAttempts: REDUCE_MAX_ATTEMPTS,
        canRetry: () => Date.now() - reduceStartTime < REDUCE_PARSE_RETRY_BUDGET_MS,
        onAttemptFailed: ({ attempt, reason, responseText }) => {
          console.log(
            `[AudioJob] Script attempt ${attempt}/${REDUCE_MAX_ATTEMPTS} failed: ${reason}. Response preview: ${responseText.slice(0, 500)}`
          );
        },
        generate: (attempt, previousFailure) =>
          invokeStudioLlm({
            invoke: () =>
              invokeTogetherText({
                systemPrompt: withLanguageInstruction(REDUCE_SYSTEM_PROMPT, language),
                userPrompt:
                  previousFailure === "empty_response"
                    ? reducePrompt + REDUCE_LENGTH_REMINDER
                    : previousFailure === "invalid_script"
                      ? reducePrompt + REDUCE_FORMAT_REMINDER
                      : reducePrompt,
                model: env.AUDIO_LLM,
                maxTokens: CONFIG.REDUCE_MAX_OUTPUT_TOKENS,
                temperature: attempt === 1 ? 0.6 : 0.3,
                reasoningEnabled: CONFIG.REDUCE_REASONING_ENABLED,
                onUsage: (usage) => {
                  reduceUsage = addTokenUsage(reduceUsage, usage);
                },
              }),
            timeoutMs: CONFIG.REDUCE_TIMEOUT_MS,
            phaseLabel: "AudioReduce",
            retry: {
              maxAttempts: attempt === 1 ? 2 : 1,
              baseDelayMs: 1000,
              // Empty completions are retried by the script loop, with a length reminder.
              retryableErrors: (error) =>
                !(error instanceof EmptyLlmResponseError) && isRetryableError(error),
            },
          }),
      });

    console.log(
      `[AudioJob] Parsed ${fullDialogueScript.length} dialogue lines on attempt ${scriptAttempt}/${REDUCE_MAX_ATTEMPTS}`
    );

    console.log(`[AudioJob] Generated ${fullDialogueScript.length} dialogue lines`);

    const reduceLatencyMs = Date.now() - reduceStartTime;

    // Generate title
    let title = "Audio Overview";
    try {
      title = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
        chunk: combined.substring(0, 2000),
      });
    } catch (_e) {
      console.log("[AudioJob] Title generation failed, using default");
    }

    // TTS runs in its own action so it gets a full action time budget: script writing plus TTS
    // in one action could exceed the 10-minute limit and leave the job stuck.
    const stored = await ctx.runMutation(
      internal.studio.jobMutations.audio.storeAudioOverviewScript,
      {
        audioOverviewId,
        synthesisInput: {
          script: fullDialogueScript,
          title,
          mapSuccessCount: Object.keys(mapResults).length - failedCount.count,
          mapFailedCount: failedCount.count,
          telemetry: aggregateStudioJobTelemetry({
            mapResults: Object.values(mapResults),
            reduce: {
              latencyMs: reduceLatencyMs,
              ...(reduceUsage !== undefined ? { tokenUsage: reduceUsage } : {}),
            },
          }),
        },
      }
    );
    if (!stored) {
      console.log("[AudioJob] Audio overview deleted during finalization");
      return;
    }
    await ctx.scheduler.runAfter(0, internal.studio.audio.job.synthesizeAudioOverviewPhase, {
      audioOverviewId,
      userId,
      notebookId,
    });
    logger.info("Script ready, scheduled synthesis", {
      dialogueLines: fullDialogueScript.length,
    });
  } catch (error) {
    const errorMeta = createErrorMetadata(error, "finalization");

    logger.jobError(error, {
      phase: "finalization",
      errorType: errorMeta.type,
      retryable: errorMeta.retryable,
    });

    await ctx.runMutation(internal.studio.jobMutations.audio.markAudioOverviewFailed, {
      audioOverviewId,
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

// ============================================================
// PHASE 4: Synthesize — plan chunks and fan out
// ============================================================

/** Marks the job failed in the synthesis phase. The mutation also deletes stored chunk MP3s. */
async function failSynthesisPhase(
  ctx: ActionCtx,
  logger: ReturnType<typeof createJobLogger>,
  audioOverviewId: Id<"audioOverviews">,
  error: unknown
): Promise<void> {
  const errorMeta = createErrorMetadata(error, "synthesis");

  logger.jobError(error, {
    phase: "synthesis",
    errorType: errorMeta.type,
    retryable: errorMeta.retryable,
  });

  await ctx.runMutation(internal.studio.jobMutations.audio.markAudioOverviewFailed, {
    audioOverviewId,
    error: errorMeta.message,
    metadata: {
      phase: "failed",
      errorPhase: "synthesis",
      errorType: errorMeta.type,
      retryable: errorMeta.retryable,
      failedAt: Date.now(),
    },
  });
}

/**
 * Plans the synthesis chunks and schedules one action per chunk. Each chunk runs in its own
 * action, so TTS time and memory per action stay bounded however long the script is.
 */
export async function runSynthesizeAudioOverviewPhase(
  ctx: ActionCtx,
  args: SynthesizeAudioOverviewPhaseArgs
): Promise<void> {
  "use node";

  const { audioOverviewId, userId, notebookId } = args;
  const logger = createJobLogger({ jobType: "audio", jobId: audioOverviewId, notebookId, userId });

  try {
    const audioOverview = await ctx.runQuery(internal.studio.audio.index.getInternal, {
      id: audioOverviewId,
    });
    if (!audioOverview) {
      console.log("[AudioJob] Audio overview deleted before synthesis");
      return;
    }

    const synthesisInput = audioOverview.metadata?.synthesisInput as
      | AudioSynthesisInput
      | undefined;
    if (!synthesisInput || synthesisInput.script.length === 0) {
      throw new Error("No dialogue script stored for synthesis");
    }

    // Script-only eval jobs measure the script, so they complete here without TTS time or cost.
    if (audioOverview.metadata?.skipTts === true) {
      const { script, title, mapSuccessCount, mapFailedCount, telemetry } = synthesisInput;
      const transcript = script.map((l) => l.text).join("\n");
      await ctx.runMutation(internal.studio.jobMutations.audio.saveAudioOverviewResults, {
        audioOverviewId,
        transcript,
        metadata: withStudioTelemetryMetadata(
          {
            title,
            phase: "completed",
            progress: 100,
            completedAt: Date.now(),
            mapSuccessCount,
            mapFailedCount,
            dialogueLines: script.length,
          },
          telemetry
        ),
      });
      logger.jobComplete({
        title,
        skippedTts: true,
        transcriptLength: transcript.length,
        mapSuccess: mapSuccessCount,
        mapFailed: mapFailedCount,
      });
      return;
    }

    const chunks = planSynthesisChunks(synthesisInput.script.length);
    const planned = await ctx.runMutation(internal.studio.jobMutations.audio.initAudioSynthesis, {
      audioOverviewId,
      chunks,
    });
    if (!planned) {
      console.log("[AudioJob] Synthesis already planned, or the job is no longer generating");
      return;
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      await ctx.scheduler.runAfter(0, internal.studio.audio.job.synthesizeAudioOverviewChunk, {
        audioOverviewId,
        userId,
        notebookId,
        chunkIndex,
        attempt: 0,
      });
    }
    logger.info("Scheduled synthesis chunks", {
      chunks: chunks.length,
      dialogueLines: synthesisInput.script.length,
    });
  } catch (error) {
    await failSynthesisPhase(ctx, logger, audioOverviewId, error);
    throw error;
  }
}

/**
 * Synthesizes dialogue lines in order, CONFIG.TTS_BATCH_SIZE at a time. A line that fails is
 * skipped and counted. `lineOffset` is the first line's index in the script, for logs.
 */
async function synthesizeDialogueLines(
  lines: DialogueLine[],
  lineOffset: number
): Promise<{ buffers: Buffer[]; failedLines: number; firstError?: string }> {
  const ttsClient = createTogetherTtsClient();
  const buffers: Buffer[] = [];
  let failedLines = 0;
  let firstError: string | undefined;

  for (let i = 0; i < lines.length; i += CONFIG.TTS_BATCH_SIZE) {
    const batch = await Promise.all(
      lines.slice(i, i + CONFIG.TTS_BATCH_SIZE).map(async (line, batchIdx) => {
        try {
          return await synthesizeSpeechToBuffer(ttsClient, {
            model: env.AUDIO_TTS_MODEL,
            input: line.text,
            voice: line.speaker === "host_a" ? VOICES.host_a : VOICES.host_b,
            timeoutMs: CONFIG.TTS_TIMEOUT_MS,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          firstError ??= message;
          failedLines += 1;
          console.log(`[AudioJob] Failed line ${lineOffset + i + batchIdx + 1}: ${message}`);
          return null;
        }
      })
    );
    for (const buffer of batch) {
      if (buffer) buffers.push(buffer);
    }
  }

  return { buffers, failedLines, firstError };
}

/**
 * Synthesizes one chunk of the script, stores it as an MP3 and records it. Recording the last
 * chunk schedules assembly. A failed chunk retries once, then fails the job.
 */
export async function runSynthesizeAudioOverviewChunkPhase(
  ctx: ActionCtx,
  args: SynthesizeAudioOverviewChunkPhaseArgs
): Promise<void> {
  "use node";

  const { audioOverviewId, userId, notebookId, chunkIndex, attempt } = args;
  const logger = createJobLogger({ jobType: "audio", jobId: audioOverviewId, notebookId, userId });
  // Stored but not yet recorded: nothing else would delete it if this action fails.
  let unrecordedStorageId: Id<"_storage"> | undefined;

  try {
    const audioOverview = await ctx.runQuery(internal.studio.audio.index.getInternal, {
      id: audioOverviewId,
    });
    if (!audioOverview || audioOverview.status !== "generating") {
      console.log(
        `[AudioJob] Skipping synthesis chunk ${chunkIndex}: job deleted or no longer generating`
      );
      return;
    }

    const synthesisInput = audioOverview.metadata?.synthesisInput as
      | AudioSynthesisInput
      | undefined;
    const synthesis = audioOverview.metadata?.synthesis as AudioSynthesisState | undefined;
    const range = synthesis?.chunks[chunkIndex];
    if (!synthesisInput || !synthesis || !range) {
      throw new Error(`No script or plan stored for synthesis chunk ${chunkIndex}`);
    }

    const startTime = Date.now();
    const { buffers, failedLines, firstError } = await synthesizeDialogueLines(
      synthesisInput.script.slice(range.start, range.end),
      range.start
    );
    let storageId: Id<"_storage"> | undefined;
    if (buffers.length > 0) {
      const mp3 = encodePcmWavToMp3(concatenateWavBuffers(buffers));
      storageId = await ctx.storage.store(new Blob([new Uint8Array(mp3)], { type: "audio/mpeg" }));
      unrecordedStorageId = storageId;
    }
    const latencyMs = Date.now() - startTime;
    console.log(
      `[AudioJob] Synthesis chunk ${chunkIndex + 1}/${synthesis.chunks.length} (lines ${range.start + 1}-${range.end}): ${buffers.length} synthesized, ${failedLines} failed, ${latencyMs} ms`
    );

    // Recording the last chunk also schedules assembly, in the same transaction.
    await ctx.runMutation(internal.studio.jobMutations.audio.recordAudioSynthesisChunk, {
      audioOverviewId,
      chunkIndex,
      result: {
        ...(storageId ? { storageId } : {}),
        synthesizedLines: buffers.length,
        failedLines,
        ...(firstError ? { firstError } : {}),
        latencyMs,
      },
    });
    unrecordedStorageId = undefined;
  } catch (error) {
    if (unrecordedStorageId) {
      await ctx.storage.delete(unrecordedStorageId).catch((deleteError: unknown) => {
        console.warn(
          `[AudioJob] Could not delete unrecorded chunk audio ${unrecordedStorageId}: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`
        );
      });
    }
    if (attempt === 0) {
      console.log(
        `[AudioJob] Synthesis chunk ${chunkIndex} failed, retrying: ${error instanceof Error ? error.message : String(error)}`
      );
      await ctx.scheduler.runAfter(
        CONFIG.SYNTHESIS_CHUNK_RETRY_DELAY_MS,
        internal.studio.audio.job.synthesizeAudioOverviewChunk,
        { ...args, attempt: 1 }
      );
      return;
    }
    await failSynthesisPhase(ctx, logger, audioOverviewId, error);
    throw error;
  }
}

// ============================================================
// PHASE 5: Assemble (join chunk MP3s + Upload + Save)
// ============================================================

export async function runAssembleAudioOverviewPhase(
  ctx: ActionCtx,
  args: SynthesizeAudioOverviewPhaseArgs
): Promise<void> {
  "use node";

  const { audioOverviewId, userId, notebookId } = args;
  const logger = createJobLogger({ jobType: "audio", jobId: audioOverviewId, notebookId, userId });

  try {
    const audioOverview = await ctx.runQuery(internal.studio.audio.index.getInternal, {
      id: audioOverviewId,
    });
    if (!audioOverview || audioOverview.status !== "generating") {
      console.log("[AudioJob] Skipping assembly: job deleted or no longer generating");
      return;
    }

    const synthesisInput = audioOverview.metadata?.synthesisInput as
      | AudioSynthesisInput
      | undefined;
    const synthesis = audioOverview.metadata?.synthesis as AudioSynthesisState | undefined;
    if (!synthesisInput || !synthesis) {
      throw new Error("No script or synthesis results stored for assembly");
    }
    const {
      script: fullDialogueScript,
      title,
      mapSuccessCount,
      mapFailedCount,
      telemetry,
    } = synthesisInput;

    const results = synthesis.chunks.map((_, chunkIndex) => {
      const result = synthesis.done[chunkIndex];
      if (!result) throw new Error(`Synthesis chunk ${chunkIndex} has no result`);
      return result;
    });
    const successCount = results.reduce((sum, result) => sum + result.synthesizedLines, 0);
    if (successCount < fullDialogueScript.length * 0.5) {
      const firstSynthesisError = results.find((result) => result.firstError)?.firstError;
      throw new Error(
        `Too many synthesis failures: ${successCount}/${fullDialogueScript.length} lines synthesized (first error: ${firstSynthesisError ?? "unknown"})`
      );
    }

    const chunkMp3s: Buffer[] = [];
    for (const result of results) {
      if (!result.storageId) continue;
      const blob = await ctx.storage.get(result.storageId);
      if (!blob) throw new Error(`Synthesis chunk audio ${result.storageId} is missing`);
      chunkMp3s.push(Buffer.from(await blob.arrayBuffer()));
    }
    const audioBuffer = concatenateMp3Buffers(chunkMp3s);
    console.log(
      `[AudioJob] Audio synthesis complete: ${successCount} lines in ${results.length} chunks, ${audioBuffer.length} MP3 bytes`
    );

    // Update status for uploading
    await ctx.runMutation(internal.studio.jobMutations.audio.updateAudioOverviewStatus, {
      audioOverviewId,
      status: "generating",
      metadata: {
        phase: "uploading",
        progress: 95,
        currentStep: "Uploading audio...",
      },
    });

    // Upload to Convex storage
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" });
    const storageId = await ctx.storage.store(blob);

    // Get the standard Convex storage URL first
    const standardUrl = await ctx.storage.getUrl(storageId);

    if (!standardUrl) {
      throw new Error("Failed to get Convex storage URL for audio");
    }

    // For now, use the standard URL while we debug the custom endpoint
    // TODO: Switch to custom /audio/ endpoint once verified working
    const audioUrl = standardUrl;

    console.log(`[AudioJob] Audio uploaded:`, {
      storageId,
      standardUrl,
      customUrl: `${process.env.CONVEX_DEPLOYMENT}/audio/${storageId}`,
    });

    // Build transcript
    const transcript = fullDialogueScript.map((l) => l.text).join("\n");

    // Save results. This also deletes the chunk MP3s.
    await ctx.runMutation(internal.studio.jobMutations.audio.saveAudioOverviewResults, {
      audioOverviewId,
      audioUrl,
      transcript,
      metadata: withStudioTelemetryMetadata(
        {
          title,
          phase: "completed",
          progress: 100,
          completedAt: Date.now(),
          mapSuccessCount,
          mapFailedCount,
          dialogueLines: successCount,
        },
        {
          ...telemetry,
          stageSpans: [
            ...(telemetry.stageSpans ?? []),
            { stage: "tts", latencyMs: Date.now() - synthesis.startedAt },
          ],
        }
      ),
    });

    logger.jobComplete({
      title,
      audioUrl,
      transcriptLength: transcript.length,
      mapSuccess: mapSuccessCount,
      mapFailed: mapFailedCount,
    });
  } catch (error) {
    await failSynthesisPhase(ctx, logger, audioOverviewId, error);
    throw error;
  }
}

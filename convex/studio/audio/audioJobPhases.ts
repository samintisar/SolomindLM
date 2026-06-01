"use node";

/**
 * Audio overview generation — phase logic.
 * @see ./job.ts for Convex `internalAction` registrations.
 */

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  countTokens,
  packChunks,
  sanitizeUserInput,
  validateChunks,
} from "../../_agents/_shared/index";
import { withLanguageInstruction } from "../../_agents/_shared/languageInstruction";
import { mergeModelKwargs } from "../../_agents/_shared/llm_factory";
import { createErrorMetadata, createJobLogger } from "../../_agents/_shared/logging";
import {
  type AudioLength,
  type AudioType,
  getMapPrompt,
  getReducePrompt,
  MAP_SYSTEM_PROMPT,
  REDUCE_SYSTEM_PROMPT,
  TARGET_LINE_COUNTS,
} from "../../_agents/audio_overview/prompts";
import type { DialogueLine } from "../../_agents/audio_overview/state";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { env } from "../../_lib/env";
import { encodePcmWavToMp3 } from "../../_services/ai/mp3.js";
import {
  createTogetherTtsClient,
  synthesizeSpeechToBuffer,
} from "../../_services/ai/togetherTts.js";
import { concatenateWavBuffers } from "../../_services/ai/wav.js";
import { collapseStringOutputsByTokens } from "../_job/collapseStringOutputsByTokens";
import { invokeStudioLlm } from "../_job/invokeStudioLlm";

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 20_000,
  REDUCE_CHUNK_SIZE_TOKENS: 40_000,
  PER_CHUNK_TIMEOUT_MS: 90_000, // 90 seconds per chunk
  REDUCE_TIMEOUT_MS: 600_000, // 10 minutes
  REDUCE_MAX_OUTPUT_TOKENS: 16_384,
  TTS_TIMEOUT_MS: 300_000, // 5 minutes
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

/** Kokoro (or other Together TTS) voice IDs per host */
const VOICES = {
  host_a: env.AUDIO_VOICE_HOST_A,
  host_b: env.AUDIO_VOICE_HOST_B,
} as const;

// ============================================================
// HELPER: Create LLMs
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

function createReduceLLM(): ChatTogetherAI {
  const model = env.AUDIO_LLM;
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model,
    temperature: 0.6,
    maxTokens: CONFIG.REDUCE_MAX_OUTPUT_TOKENS,
    timeout: CONFIG.REDUCE_TIMEOUT_MS,
    modelKwargs: mergeModelKwargs(model, "smart"),
  });
}

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
    const packedChunks = packChunks(validatedChunks, {
      targetSize: CONFIG.MAP_CHUNK_SIZE_TOKENS,
      minChunkLength: 50,
      maxChunkLength: 50000,
      agentName: "AudioOverviewJob",
    });

    console.log(
      `[AudioJob] Packed ${rawChunks.length} chunks into ${packedChunks.length} map tasks`
    );

    if (packedChunks.length === 0) {
      throw new Error("No valid chunks to process");
    }

    // Initialize map phase metadata
    await ctx.runMutation(internal.studio.jobMutations.audio.initAudioOverviewMapPhase, {
      audioOverviewId,
      totalMapTasks: packedChunks.length,
    });

    // Schedule each map task as a separate action
    for (let i = 0; i < packedChunks.length; i++) {
      await ctx.scheduler.runAfter(0, internal.studio.audio.job.processAudioMapChunk, {
        audioOverviewId,
        userId,
        notebookId,
        chunkIndex: i,
        totalChunks: packedChunks.length,
        chunk: packedChunks[i],
      });
      console.log(`[AudioJob] Scheduled map task ${i + 1}/${packedChunks.length}`);
    }

    logger.info("Map phase initialized", {
      totalMapTasks: packedChunks.length,
      chunkSizes: packedChunks.map((c) => c.length),
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
    const llm = createMapLLM();
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
    const response = await invokeStudioLlm({
      invoke: () =>
        (llm as any).invoke([
          new SystemMessage(withLanguageInstruction(MAP_SYSTEM_PROMPT, language)),
          new HumanMessage(prompt),
        ]),
      timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
      phaseLabel: "AudioMap",
      onRetry: (attempt, error) => {
        console.log(`[AudioJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`);
      },
    });

    const elapsed = Date.now() - startTime;
    const output = String((response as any).content);

    console.log(`[AudioJob] ${chunkId} LLM completed in ${elapsed}ms`);

    // Store result
    const result = {
      beats: output,
      processingTimeMs: elapsed,
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
// PHASE 3: Finalize (Collapse + Write Script + Synthesize + Upload)
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
    const llm = createReduceLLM();
    const targetLines = TARGET_LINE_COUNTS[length];

    let fullDialogueScript: DialogueLine[] = [];

    console.log(
      `[AudioJob] Script config: type=${audioType}, length=${length}, targetLines=${targetLines}, focus=${sanitizedFocus || "general overview"}, reduceTimeoutMs=${CONFIG.REDUCE_TIMEOUT_MS}, reduceMaxOutputTokens=${CONFIG.REDUCE_MAX_OUTPUT_TOKENS}, thinking=false`
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

    const response = await invokeStudioLlm({
      invoke: () =>
        (llm as any).invoke([
          new SystemMessage(withLanguageInstruction(REDUCE_SYSTEM_PROMPT, language)),
          new HumanMessage(reducePrompt),
        ]),
      timeoutMs: CONFIG.REDUCE_TIMEOUT_MS,
      phaseLabel: "AudioReduce",
      retry: { maxAttempts: 2, baseDelayMs: 1000 },
    });

    const responseAny = response as any;
    const responseContent = responseAny?.content;
    const responseText =
      typeof responseContent === "string"
        ? responseContent
        : Array.isArray(responseContent)
          ? responseContent
              .map((part: any) => {
                if (typeof part === "string") return part;
                if (part && typeof part === "object" && typeof part.text === "string")
                  return part.text;
                return "";
              })
              .join("")
          : String(responseContent ?? "");
    const finishReason =
      responseAny?.response_metadata?.finish_reason ??
      responseAny?.response_metadata?.finishReason ??
      null;
    const jsonStart = responseText.indexOf("[");
    const jsonEnd = responseText.lastIndexOf("]");

    console.log(
      `[AudioJob] Script response responseChars=${responseText.length}, jsonStart=${jsonStart}, jsonEnd=${jsonEnd}, finishReason=${finishReason ?? "unknown"}`
    );

    // Try multiple parsing strategies
    if (jsonStart !== -1 && jsonEnd !== -1) {
      // Strategy 1: Parse the full JSON array
      try {
        const parsed = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1)) as DialogueLine[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          fullDialogueScript = parsed;
          console.log(`[AudioJob] Parsed ${fullDialogueScript.length} lines via full JSON parse`);
        }
      } catch (error) {
        console.log(
          `[AudioJob] Full JSON parse failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Strategy 2: If full parse failed, try extracting individual objects
      if (fullDialogueScript.length === 0) {
        console.log(`[AudioJob] Attempting object-by-object recovery`);
        const objectRegex =
          /\{\s*"speaker"\s*:\s*"(host_a|host_b)"\s*,\s*"text"\s*:\s*"([^"]*)"\s*\}/g;
        let match;
        const recoveredLines: DialogueLine[] = [];
        while ((match = objectRegex.exec(responseText)) !== null) {
          recoveredLines.push({ speaker: match[1] as "host_a" | "host_b", text: match[2] });
        }
        if (recoveredLines.length > 0) {
          fullDialogueScript = recoveredLines;
          console.log(
            `[AudioJob] Recovered ${fullDialogueScript.length} lines via regex extraction`
          );
        }
      }

      // Strategy 3: Try parsing truncated JSON by finding the last complete object
      if (fullDialogueScript.length === 0) {
        console.log(`[AudioJob] Attempting truncated JSON recovery`);
        const truncated = responseText.substring(jsonStart, jsonEnd + 1);
        // Try to find the last valid complete object and close the array
        const lastCompleteObject = truncated.lastIndexOf('"},');
        if (lastCompleteObject > 0) {
          const fixedJson = truncated.substring(0, lastCompleteObject + 2) + "\n]";
          try {
            const parsed = JSON.parse(fixedJson) as DialogueLine[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              fullDialogueScript = parsed;
              console.log(
                `[AudioJob] Recovered ${fullDialogueScript.length} lines via truncation fix`
              );
            }
          } catch (_e) {
            // Ignore
          }
        }
      }
    }

    if (fullDialogueScript.length === 0) {
      console.log(
        `[AudioJob] Dialogue generation returned no parsable JSON, using fallback script. Response preview: ${responseText.slice(0, 500)}`
      );
      fullDialogueScript = [
        { speaker: "host_a", text: "I've analyzed the content you provided." },
        { speaker: "host_b", text: "What did you find most interesting?" },
        { speaker: "host_a", text: "There were several key points worth discussing." },
      ];
    }

    console.log(`[AudioJob] Generated ${fullDialogueScript.length} dialogue lines`);

    // Update status for audio synthesis
    await ctx.runMutation(internal.studio.jobMutations.audio.updateAudioOverviewStatus, {
      audioOverviewId,
      status: "generating",
      metadata: {
        phase: "synthesizing",
        progress: 70,
        currentStep: "Synthesizing audio...",
      },
    });

    const ttsClient = createTogetherTtsClient();
    const results: { index: number; buffer: Buffer | null }[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < fullDialogueScript.length; i += BATCH_SIZE) {
      const batchLines = fullDialogueScript.slice(i, i + BATCH_SIZE);

      const batchPromises = batchLines.map(async (line, batchIdx) => {
        const globalIndex = i + batchIdx;
        const voice = line.speaker === "host_a" ? VOICES.host_a : VOICES.host_b;

        try {
          const buffer = await synthesizeSpeechToBuffer(ttsClient, {
            model: env.AUDIO_TTS_MODEL,
            input: line.text,
            voice,
            timeoutMs: CONFIG.TTS_TIMEOUT_MS,
          });
          return { index: globalIndex, buffer };
        } catch (_error) {
          console.log(`[AudioJob] Failed line ${globalIndex + 1}`);
          return { index: globalIndex, buffer: null };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const sortedBuffers = results
      .sort((a, b) => a.index - b.index)
      .map((r) => r.buffer)
      .filter((b): b is Buffer => b !== null);

    const successCount = sortedBuffers.length;

    if (successCount < fullDialogueScript.length * 0.5) {
      throw new Error(`Too many synthesis failures: ${successCount}/${fullDialogueScript.length}`);
    }

    const wavBuffer = concatenateWavBuffers(sortedBuffers);
    const audioBuffer = encodePcmWavToMp3(wavBuffer);
    console.log(
      `[AudioJob] Audio synthesis complete: ${successCount} lines, ${wavBuffer.length} WAV bytes, ${audioBuffer.length} MP3 bytes`
    );

    // Update status for uploading
    await ctx.runMutation(internal.studio.jobMutations.audio.updateAudioOverviewStatus, {
      audioOverviewId,
      status: "generating",
      metadata: {
        phase: "uploading",
        progress: 90,
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

    // Generate title
    let title = "Audio Overview";
    try {
      title = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
        chunk: combined.substring(0, 2000),
      });
    } catch (_e) {
      console.log("[AudioJob] Title generation failed, using default");
    }

    // Save results
    await ctx.runMutation(internal.studio.jobMutations.audio.saveAudioOverviewResults, {
      audioOverviewId,
      audioUrl,
      transcript,
      metadata: {
        title,
        phase: "completed",
        progress: 100,
        completedAt: Date.now(),
        mapSuccessCount: Object.keys(mapResults).length - failedCount.count,
        mapFailedCount: failedCount.count,
        dialogueLines: successCount,
      },
    });

    // Clear intermediate data
    await ctx.runMutation(internal.studio.jobMutations.audio.clearAudioOverviewMapData, {
      audioOverviewId,
    });

    logger.jobComplete({
      title,
      audioUrl,
      transcriptLength: transcript.length,
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

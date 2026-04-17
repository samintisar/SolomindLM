"use node";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import {
  invokeWithTimeout,
  invokeWithRetry,
  sanitizeUserInput,
  createLangSmithRunConfig,
} from "../_shared/index.js";
import { createAgentGraphLogger } from "../_shared/logging.js";
import type { OverallStateType, ChunkProcessState } from "./state.js";
import { getMapPrompt, MAP_SYSTEM_PROMPT } from "./prompts.js";
import { GRAPH_CONFIG } from "./config.js";

/**
 * Extract dialogue beats from a chunk (map phase).
 */
export async function extractBeats(
  state: ChunkProcessState,
  fastLlm: any
): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger("AudioOverviewGraph", "audio");
  const { chunk, audioType, length, focus, chunkIndex, totalChunks } = state;
  const startTime = Date.now();

  logger.phaseStart("extract_beats", {
    agent: "AudioOverviewGraph",
    chunkIndex,
    chunkLength: chunk.length,
    audioType,
    length,
    focus: focus || "none",
  });

  // Sanitize user input (focus)
  const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;

  const prompt = getMapPrompt(audioType, chunk, sanitizedFocus);

  logger.info(`Sending prompt to LLM (${prompt.length} chars)...`, {
    agent: "AudioOverviewGraph",
    phase: "extract_beats",
    chunkIndex,
    promptLength: prompt.length,
  });

  let output: string;
  try {
    // Timeout + Retry wrapper for resilient LLM calls
    const response = await invokeWithRetry(
      () =>
        invokeWithTimeout(
          () =>
            fastLlm.invoke(
              [new SystemMessage(MAP_SYSTEM_PROMPT), new HumanMessage(prompt)],
              createLangSmithRunConfig({
                runName: "AudioOverviewGraph.ExtractBeats",
                tags: ["agent", "audio-overview", "map"],
                metadata: {
                  chunkIndex,
                  chunkLength: chunk.length,
                  audioType,
                  length,
                  focus: focus || "none",
                },
              })
            ),
          GRAPH_CONFIG.MAP_TIMEOUT_MS,
          "AudioMap"
        ),
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          logger.warn(`Retry attempt ${attempt}/3`, {
            agent: "AudioOverviewGraph",
            phase: "extract_beats",
            chunkIndex,
            attempt,
            error: error.message,
          });
        },
      },
      "AudioMap"
    );

    output = String((response as { content: { toString: () => string } }).content);
  } catch (error) {
    const errorContext = {
      agent: "AudioOverviewGraph",
      phase: "extract_beats",
      chunkIndex,
      chunkLength: chunk.length,
      audioType,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack?.split("\n").slice(0, 3).join("\n"),
            }
          : String(error),
    };

    logger.phaseError(
      "extract_beats",
      error instanceof Error ? error : new Error(String(error)),
      errorContext
    );

    output = `• Error processing chunk ${chunkIndex}\n• Unable to extract dialogue beats\n\n[Fallback: Continue with other chunks]`;
  }

  const elapsed = Date.now() - startTime;

  logger.phaseComplete("extract_beats", {
    agent: "AudioOverviewGraph",
    chunkIndex,
    outputLength: output.length,
    processingTimeMs: elapsed,
  });

  return {
    mapOutputs: [output],
    progress: {
      phase: "extract_beats",
      percentage: Math.min(10 + (chunkIndex ?? 0) * 20, 40),
      message: `Chunk ${(chunkIndex ?? 0) + 1}/${totalChunks ?? "?"} analyzed`,
      chunksCompleted: (chunkIndex ?? 0) + 1,
      totalChunks: totalChunks,
    },
  };
}

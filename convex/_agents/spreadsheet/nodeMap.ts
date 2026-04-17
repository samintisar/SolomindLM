"use node";

import type { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { invokeWithTimeout, invokeWithRetry, createLangSmithRunConfig } from "../_shared/index.js";

import { GRAPH_CONFIG, PROCESSING_CONFIG } from "./config.js";
import { getMessageContent } from "./csvHelpers.js";
import { sanitizeUserInput } from "./inputValidation.js";
import { MAP_PROMPTS, MAP_SYSTEM_PROMPT } from "./prompts.js";
import type { ChunkProcessState, OverallStateType } from "./state.js";

export type SpreadsheetMapDeps = {
  fastLlm: ChatTogetherAI;
};

// Node: Map phase (runs in parallel via Send) - Extract text/summaries
export async function mapProcess(
  state: ChunkProcessState,
  deps: SpreadsheetMapDeps
): Promise<Partial<OverallStateType>> {
  const { chunk, chunkIndex, spreadsheetType, customPrompt } = state;
  const startTime = Date.now();

  const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : "[Chunk ?]";
  console.log(`\n${"=".repeat(80)}`);
  console.log(`[SpreadsheetGraph] ===== MAP PROCESS PHASE ${chunkId} =====`);
  console.log("=".repeat(80));
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "map_process",
        chunkIndex: chunkIndex,
        chunkLength: chunk.length,
        chunkPreview: chunk.substring(0, 150).replace(/\n/g, " "),
        spreadsheetType: spreadsheetType,
      },
      null,
      2
    )
  );

  // Build prompt for text extraction (no structured output)
  // If customPrompt is provided (even for predefined types), use the custom template
  // Otherwise, use the predefined template for the spreadsheet type
  const promptTemplate =
    customPrompt && customPrompt.trim()
      ? MAP_PROMPTS["custom"]
      : MAP_PROMPTS[spreadsheetType] || MAP_PROMPTS["custom"];
  const prompt = promptTemplate
    .replace("{chunk}", chunk)
    .replace("{customPrompt}", sanitizeUserInput(customPrompt || ""));

  console.log(`[SpreadsheetGraph] ${chunkId} Sending prompt to LLM (${prompt.length} chars)...`);

  let mapOutput: string;
  try {
    mapOutput = await invokeWithRetry<string>(
      () =>
        invokeWithTimeout(
          () =>
            (deps.fastLlm as any).invoke(
              [new SystemMessage(MAP_SYSTEM_PROMPT), new HumanMessage(prompt)],
              createLangSmithRunConfig({
                runName: "SpreadsheetGraph.MapProcess",
                tags: ["agent", "spreadsheet", "map"],
                metadata: {
                  chunkIndex,
                  spreadsheetType,
                  chunkLength: chunk.length,
                },
              })
            ),
          GRAPH_CONFIG.MAP_TIMEOUT_MS,
          "Map"
        ),
      {
        maxAttempts: PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
        baseDelayMs: PROCESSING_CONFIG.RETRY_BACKOFF_MS,
        onRetry: (attempt, error, delay) => {
          console.warn(
            `[SpreadsheetGraph] Map ${chunkId} attempt ${attempt}/${PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS} failed:`,
            error.message
          );
          console.log(`[SpreadsheetGraph] Retrying Map ${chunkId} in ${delay}ms...`);
        },
      },
      `Map ${chunkId}`
    );
    // Get the text content from the response
    mapOutput = getMessageContent(mapOutput);
  } catch (error) {
    const errorContext = {
      timestamp: new Date().toISOString(),
      chunkId,
      chunkLength: chunk.length,
      spreadsheetType,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack?.split("\n").slice(0, 3).join("\n"),
            }
          : String(error),
    };
    console.error("[SpreadsheetGraph] Map process error:", JSON.stringify(errorContext, null, 2));
    throw error;
  }

  const elapsed = Date.now() - startTime;

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "map_process_complete",
        chunkIndex: chunkIndex,
        outputLength: mapOutput.length,
        processingTimeMs: elapsed,
        outputPreview: mapOutput.substring(0, 300).replace(/\n/g, " "),
      },
      null,
      2
    )
  );

  console.log(`[SpreadsheetGraph] ${chunkId} Extracted ${mapOutput.length} chars of text data`);

  return {
    mapOutputs: [mapOutput], // Direct text output, no JSON
    progress: {
      phase: "map_process",
      percentage: Math.min(10 + (chunkIndex ?? 0) * 30, 60),
      message: `Chunk ${(chunkIndex ?? 0) + 1}/${state.totalChunks ?? "?"} complete`,
      chunksCompleted: (chunkIndex ?? 0) + 1,
      totalChunks: state.totalChunks,
    },
  };
}

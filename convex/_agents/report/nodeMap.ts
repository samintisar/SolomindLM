"use node";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { createLangSmithRunConfig } from "../_shared/index.js";

import { PROCESSING_CONFIG } from "./config.js";
import { sanitizeUserInput } from "./inputValidation.js";
import { invokeWithRetry, invokeWithTimeout } from "./invokeHelpers.js";
import { MAP_PROMPTS, MAP_SYSTEM_PROMPT } from "./prompts.js";
import type { MapOutput, MapOutputInvoker } from "./structuredLlm.js";
import type { ChunkProcessState, OverallStateType } from "./state.js";

export async function mapProcess(
  state: ChunkProcessState,
  fastLlmStructured: MapOutputInvoker
): Promise<Partial<OverallStateType>> {
  const { chunk, chunkIndex, reportType, customPrompt } = state;
  const startTime = Date.now();

  const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : "[Chunk ?]";
  console.log(`\n${"=".repeat(80)}`);
  console.log(`[ReportGraph] ===== MAP PROCESS PHASE ${chunkId} =====`);
  console.log("=".repeat(80));
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "map_process",
        chunkIndex: chunkIndex,
        chunkLength: chunk.length,
        chunkPreview: chunk.substring(0, 150).replace(/\n/g, " "),
        reportType: reportType,
      },
      null,
      2
    )
  );

  const promptTemplate = MAP_PROMPTS[reportType] || MAP_PROMPTS["custom"];
  const prompt = promptTemplate
    .replace("{chunk}", chunk)
    .replace("{customPrompt}", sanitizeUserInput(customPrompt || ""));

  const structuredPrompt = `${prompt}

IMPORTANT: Respond with a JSON object containing:
1. "topics": An array of 3-5 key topics this section covers
2. "summary": The complete structured summary as described above`;

  console.log(`[ReportGraph] ${chunkId} Sending prompt to LLM (${prompt.length} chars)...`);

  let mapOutput: MapOutput;
  try {
    mapOutput = await invokeWithRetry<MapOutput>(
      () =>
        invokeWithTimeout(
          () =>
            fastLlmStructured.invoke(
              [new SystemMessage(MAP_SYSTEM_PROMPT), new HumanMessage(structuredPrompt)],
              createLangSmithRunConfig({
                runName: "ReportGraph.MapProcess",
                tags: ["agent", "report", "map"],
                metadata: {
                  chunkIndex,
                  reportType,
                  chunkLength: chunk.length,
                },
              })
            ),
          PROCESSING_CONFIG.PER_CHUNK_TIMEOUT_MS,
          `Map ${chunkId}`
        ),
      1,
      `Map ${chunkId}`
    );
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const isTimeout =
      (error as any).isTimeout ||
      (error instanceof Error &&
        (error.message.includes("timeout") ||
          error.message.includes("Timeout") ||
          error.message.includes("exceeded")));

    const errorContext = {
      timestamp: new Date().toISOString(),
      phase: "map_process",
      chunkId,
      chunkIndex: chunkIndex,
      chunkLength: chunk.length,
      reportType,
      elapsedTime: elapsed,
      isTimeout: isTimeout,
      timeoutLimit: PROCESSING_CONFIG.PER_CHUNK_TIMEOUT_MS,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack?.split("\n").slice(0, 5).join("\n"),
              phase: (error as any).phase,
              isTimeout: (error as any).isTimeout,
            }
          : String(error),
    };
    console.error("[ReportGraph] ===== MAP PROCESS ERROR =====");
    console.error("[ReportGraph] Error context:", JSON.stringify(errorContext, null, 2));
    console.error("[ReportGraph] =====================================");
    console.warn(`[ReportGraph] ⚠️ ${chunkId} failed, returning error marker instead of throwing`);

    const errorMarker = JSON.stringify({
      _error: true,
      chunkIndex: chunkIndex,
      errorMessage: error instanceof Error ? error.message : String(error),
      isTimeout: isTimeout,
      elapsedTime: elapsed,
    }) as string;

    return {
      mapOutputs: [errorMarker],
      progress: {
        phase: "map_process",
        percentage: 10 + (chunkIndex ?? 0) * 30,
        message: `Chunk ${(chunkIndex ?? 0) + 1}/${state.totalChunks ?? "?"} failed`,
        chunksCompleted: (chunkIndex ?? 0) + 1,
        totalChunks: state.totalChunks,
      },
    };
  }

  const elapsed = Date.now() - startTime;

  const outputJson = JSON.stringify(mapOutput);
  const extractedTopics = mapOutput.topics;

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "map_process_complete",
        chunkIndex: chunkIndex,
        outputLength: outputJson.length,
        summaryLength: mapOutput.summary.length,
        processingTimeMs: elapsed,
        extractedTopics: extractedTopics,
        summaryPreview: mapOutput.summary.substring(0, 300).replace(/\n/g, " "),
      },
      null,
      2
    )
  );

  console.log(`[ReportGraph] ${chunkId} Extracted topics: ${extractedTopics.join(", ")}`);

  return {
    mapOutputs: [outputJson],
    progress: {
      phase: "map_process",
      percentage: Math.min(10 + (chunkIndex ?? 0) * 30, 60),
      message: `Chunk ${(chunkIndex ?? 0) + 1}/${state.totalChunks ?? "?"} complete`,
      chunksCompleted: (chunkIndex ?? 0) + 1,
      totalChunks: state.totalChunks,
    },
  };
}

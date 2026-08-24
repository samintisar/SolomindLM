"use node";

import { Send } from "@langchain/langgraph";

import { createAgentGraphLogger } from "../_shared/logging.js";
import { selectStudioMapBatches } from "../_shared/studioExecutionMode.js";
import { countTokens } from "../_shared/tokenizer.js";

import { packChunks, validateChunks } from "./chunkHelpers.js";
import { GRAPH_CONFIG } from "./config.js";
import { NODES } from "./prompts.js";
import type { OverallStateType } from "./state.js";

/**
 * Creates parallel map tasks from input chunks.
 */
export function createMapTasks(state: OverallStateType): Send[] | "skip_map" {
  const logger = createAgentGraphLogger("MindMapGraph", "mindmap");
  const validated = validateChunks(state.allChunks);

  if (validated.length === 0) {
    throw new Error("No valid chunks after validation");
  }

  const { mode, batches: packed } = selectStudioMapBatches({
    documentCount: state.documentIds?.length ?? 0,
    chunks: validated,
    estimateTokens: countTokens,
    pack: (chunks) => packChunks(chunks, GRAPH_CONFIG.OPTIMAL_CHUNK_SIZE_TOKENS),
  });

  if (packed.length === 0) {
    throw new Error("No map batches after skip-map planning");
  }

  if (mode === "single_pass") {
    logger.info("Routing directly to skip_map", {
      agent: "MindMapGraph",
      phase: "fan_out",
      executionMode: mode,
      originalChunks: state.allChunks.length,
      packedChunks: packed.length,
    });
    return "skip_map";
  }

  logger.info(`Fanning out to ${packed.length} map nodes`, {
    agent: "MindMapGraph",
    phase: "fan_out",
    executionMode: mode,
    originalChunks: state.allChunks.length,
    packedChunks: packed.length,
  });

  return packed.map(
    (chunk, idx) =>
      new Send(NODES.MAP_PROCESS, {
        content: chunk,
        retryCount: 0,
        chunkIndex: idx,
        totalChunks: packed.length,
      })
  );
}

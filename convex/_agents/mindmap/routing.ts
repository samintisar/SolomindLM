"use node";

import { Send } from "@langchain/langgraph";

import { createAgentGraphLogger } from "../_shared/logging.js";

import { packChunks, validateChunks } from "./chunkHelpers.js";
import { GRAPH_CONFIG } from "./config.js";
import { NODES } from "./prompts.js";
import type { OverallStateType } from "./state.js";

/**
 * Creates parallel map tasks from input chunks.
 */
export function createMapTasks(state: OverallStateType): Send[] {
  const logger = createAgentGraphLogger("MindMapGraph", "mindmap");
  const validated = validateChunks(state.allChunks);

  if (validated.length === 0) {
    throw new Error("No valid chunks after validation");
  }

  const packed = packChunks(validated, GRAPH_CONFIG.OPTIMAL_CHUNK_SIZE_TOKENS);

  logger.info(`Fanning out to ${packed.length} map nodes`, {
    agent: "MindMapGraph",
    phase: "fan_out",
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

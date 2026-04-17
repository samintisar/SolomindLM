"use node";

import {
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
} from "../_shared/index.js";

import { GRAPH_CONFIG } from "./config.js";

export function packChunks(
  chunks: string[],
  targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS
): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: "WrittenQuestionsGraph",
  });
}

export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: "WrittenQuestionsGraph",
  });
}

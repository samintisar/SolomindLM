"use node";

import {
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
} from "../_shared/index.js";

import { GRAPH_CONFIG } from "./config.js";

/**
 * Wrapper around shared packChunks utility with SlideDeckGraph logging.
 */
export function packChunks(
  chunks: string[],
  targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS
): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: "SlideDeckGraph",
  });
}

/**
 * Wrapper around shared validateChunks utility with SlideDeckGraph logging.
 */
export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: "SlideDeckGraph",
  });
}

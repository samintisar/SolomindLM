"use node";

import {
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
} from "../_shared/index.js";

import { GRAPH_CONFIG, PROCESSING_CONFIG } from "./config.js";

/**
 * Wrapper around shared packChunks utility with ReportGraph logging.
 */
export function packChunks(
  chunks: string[],
  targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS
): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: PROCESSING_CONFIG.MIN_CHUNK_LENGTH,
    maxChunkLength: PROCESSING_CONFIG.MAX_CHUNK_LENGTH,
    agentName: "ReportGraph",
  });
}

/**
 * Wrapper around shared validateChunks utility with ReportGraph logging.
 */
export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS,
    minChunkLength: PROCESSING_CONFIG.MIN_CHUNK_LENGTH,
    maxChunkLength: PROCESSING_CONFIG.MAX_CHUNK_LENGTH,
    agentName: "ReportGraph",
  });
}

/** Short hash for identifying chunks in logs */
export function chunkHash(chunk: string): string {
  const start = chunk.substring(0, PROCESSING_CONFIG.HASH_START_LENGTH).replace(/\n/g, " ");
  const end = chunk
    .substring(Math.max(0, chunk.length - PROCESSING_CONFIG.HASH_END_LENGTH))
    .replace(/\n/g, " ");
  return `[${chunk.length} chars] "${start}..."..."${end}"`;
}

"use node"

import {
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
} from '../_shared/index.js';

import { GRAPH_CONFIG, PROCESSING_CONFIG } from './config.js';

/**
 * Wrapper around shared packChunks utility with SpreadsheetGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: PROCESSING_CONFIG.MIN_CHUNK_LENGTH,
    maxChunkLength: PROCESSING_CONFIG.MAX_CHUNK_LENGTH,
    agentName: 'SpreadsheetGraph',
  });
}

/**
 * Wrapper around shared validateChunks utility with SpreadsheetGraph logging.
 */
export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS,
    minChunkLength: PROCESSING_CONFIG.MIN_CHUNK_LENGTH,
    maxChunkLength: PROCESSING_CONFIG.MAX_CHUNK_LENGTH,
    agentName: 'SpreadsheetGraph',
  });
}

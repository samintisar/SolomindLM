"use node"

import {
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
} from '../_shared/index.js';

import { FLASHCARD_CONFIG } from './config.js';

export function packChunks(
  chunks: string[],
  targetSize: number = FLASHCARD_CONFIG.MAP_CHUNK_SIZE_TOKENS
): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'FlashcardGraph',
  });
}

export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: FLASHCARD_CONFIG.MAP_CHUNK_SIZE_TOKENS,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'FlashcardGraph',
  });
}

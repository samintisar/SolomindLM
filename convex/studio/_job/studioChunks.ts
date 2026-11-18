"use node";

/**
 * Chunk validation and packing for Studio map phases, logged under a per-type label.
 */

import {
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
} from "../../_agents/_shared/chunk_operations";

const MIN_CHUNK_LENGTH = 50;
const MAX_CHUNK_LENGTH = 50000;

export function createStudioChunkHelpers(agentName: string) {
  return {
    packChunks: (chunks: string[], targetSize: number): string[] =>
      sharedPackChunks(chunks, {
        targetSize,
        minChunkLength: MIN_CHUNK_LENGTH,
        maxChunkLength: MAX_CHUNK_LENGTH,
        agentName,
      }),
    validateChunks: (chunks: string[]): string[] =>
      sharedValidateChunks(chunks, {
        targetSize: 0,
        minChunkLength: MIN_CHUNK_LENGTH,
        maxChunkLength: MAX_CHUNK_LENGTH,
        agentName,
      }),
  };
}

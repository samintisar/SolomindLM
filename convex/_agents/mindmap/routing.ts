"use node"

import { Send } from '@langchain/langgraph';

import { logInfo } from '../_shared/index.js';

import { packChunks, validateChunks } from './chunkHelpers.js';
import { GRAPH_CONFIG } from './config.js';
import { NODES } from './prompts.js';
import type { OverallStateType } from './state.js';

/**
 * Creates parallel map tasks from input chunks.
 */
export function createMapTasks(state: OverallStateType): Send[] {
  const validated = validateChunks(state.allChunks);

  if (validated.length === 0) {
    throw new Error('No valid chunks after validation');
  }

  const packed = packChunks(validated, GRAPH_CONFIG.OPTIMAL_CHUNK_SIZE_TOKENS);

  logInfo({
    agent: 'MindMapGraph',
    phase: 'fan_out',
    originalChunks: state.allChunks.length,
    packedChunks: packed.length,
  }, `Fanning out to ${packed.length} map nodes`);

  return packed.map((chunk, idx) =>
    new Send(NODES.MAP_PROCESS, {
      content: chunk,
      retryCount: 0,
      chunkIndex: idx,
      totalChunks: packed.length,
    })
  );
}

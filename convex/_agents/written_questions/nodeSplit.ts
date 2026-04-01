"use node"

import { logInfo } from '../_shared/index.js';

import { GRAPH_CONFIG } from './config.js';
import { packChunks, validateChunks } from './chunkHelpers.js';
import type { OverallStateType } from './state.js';

export async function callStatusUpdate(
  state: OverallStateType,
  phase: string
): Promise<void> {
  if (state.onStatusUpdate) {
    try {
      await state.onStatusUpdate(phase);
    } catch (error) {
      console.error('[WrittenQuestionsGraph] Status update callback error:', error);
    }
  }
}

export async function splitChunks(state: OverallStateType): Promise<Partial<OverallStateType>> {
  console.log('\n' + '='.repeat(80));
  console.log('[WrittenQuestionsGraph] ===== SPLIT CHUNKS PHASE =====');
  console.log('='.repeat(80));
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    phase: 'split_chunks',
    documentCount: state.documentIds?.length || 0,
    chunkCount: state.chunks?.length || 0,
    targetQuestionCount: state.questionCount,
    difficulty: state.difficulty,
    questionType: state.questionType,
    focus: state.focus || 'none',
  }, null, 2));

  const validatedChunks = validateChunks(state.chunks);
  const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS);

  logInfo({
    agent: 'WrittenQuestionsGraph',
    phase: 'split_chunks',
    originalChunks: state.chunks.length,
    validatedChunks: validatedChunks.length,
    packedChunks: packedChunks.length,
  }, `Packed ${state.chunks.length} chunks into ${packedChunks.length} processed chunks`);

  await callStatusUpdate(state, 'split_chunks');

  return {
    ...state,
    chunks: packedChunks,
    status: 'mapping',
    mapOutputs: state.mapOutputs || [],
    collapsedOutputs: state.collapsedOutputs || [],
    finalOutput: state.finalOutput || [],
    progress: {
      phase: 'split_chunks',
      percentage: 5,
      message: `Prepared ${packedChunks.length} chunks for processing`,
      totalChunks: packedChunks.length,
    },
  };
}

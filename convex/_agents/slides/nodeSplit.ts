"use node"

import type { OverallStateType } from './state.js';

export async function callStatusUpdate(state: OverallStateType, phase: string): Promise<void> {
  if (state.onStatusUpdate) {
    try {
      await state.onStatusUpdate(phase);
    } catch (error) {
      console.error('[SlideDeckGraph] Status update callback error:', error);
    }
  }
}

export async function splitChunks(state: OverallStateType): Promise<Partial<OverallStateType>> {
  console.log('\n' + '='.repeat(80));
  console.log('[SlideDeckGraph] ===== SPLIT CHUNKS PHASE =====');
  console.log('='.repeat(80));
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: 'split_chunks',
        documentCount: state.documentIds?.length || 0,
        documentIds: state.documentIds || [],
        chunkCount: state.chunks?.length || 0,
        slideType: state.slideType,
        deckLength: state.deckLength,
        customPrompt: state.customPrompt || 'none',
      },
      null,
      2
    )
  );

  await callStatusUpdate(state, 'split_chunks');

  return {
    ...state,
    status: 'mapping',
    mapOutputs: state.mapOutputs || [],
    collapsedOutputs: state.collapsedOutputs || [],
    finalOutput: state.finalOutput || [],
    progress: {
      phase: 'split_chunks',
      percentage: 5,
      message: `Preparing ${state.chunks?.length || 0} chunks for processing`,
      totalChunks: state.chunks?.length || 0,
    },
  };
}

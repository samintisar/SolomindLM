"use node"

import type { OverallStateType } from './state.js';

export function mergeResults(state: OverallStateType): Partial<OverallStateType> {
  console.log(`\n${'='.repeat(80)}`);
  console.log('[ReportGraph] ===== GENERATION COMPLETE =====');
  console.log('='.repeat(80));
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    phase: 'merge_results',
    status: 'completed',
    finalOutputLength: state.finalOutput?.length || 0,
  }, null, 2));

  return {
    ...state,
    status: 'completed',
    progress: {
      phase: 'complete',
      percentage: 100,
      message: 'Report generation complete',
    },
  };
}

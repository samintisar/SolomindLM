"use node"

import type { OverallStateType } from './state.js';

// Node: Merge final results
export function mergeResults(state: OverallStateType): Partial<OverallStateType> {
  console.log(`\n${'='.repeat(80)}`);
  console.log('[SpreadsheetGraph] ===== GENERATION COMPLETE =====');
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
      message: 'Spreadsheet generation complete',
    },
  };
}

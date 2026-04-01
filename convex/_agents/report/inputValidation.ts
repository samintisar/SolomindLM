"use node"

import { MAP_PROMPTS } from './prompts.js';
import type { OverallStateType } from './state.js';
import { PROCESSING_CONFIG } from './config.js';

/**
 * Sanitize custom prompt input.
 */
export function sanitizeUserInput(input: string): string {
  if (!input) return '';

  return input
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\{.*?\}/g, '')
    .replace(/<\|.*?\|>/g, '')
    .trim()
    .substring(0, PROCESSING_CONFIG.MAX_PROMPT_LENGTH);
}

export function validateInput(state: OverallStateType): Partial<OverallStateType> {
  console.log('\n' + '='.repeat(80));
  console.log('[ReportGraph] ===== INPUT VALIDATION =====');
  console.log('='.repeat(80));

  const errors: string[] = [];

  if (!state.chunks || state.chunks.length === 0) {
    errors.push('No chunks provided for processing');
  }

  if (!state.reportType) {
    errors.push('Report type is required');
  }

  if (state.reportType && !MAP_PROMPTS[state.reportType]) {
    errors.push(`Invalid report type: ${state.reportType}. Valid types: ${Object.keys(MAP_PROMPTS).join(', ')}`);
  }

  if (errors.length > 0) {
    console.error('[ReportGraph] Validation failed:', errors);
    return {
      ...state,
      status: 'error',
      finalOutput: `# Validation Error\n\n${errors.map(e => `- ${e}`).join('\n')}\n\nPlease fix these issues and try again.`,
    };
  }

  console.log('[ReportGraph] Validation passed');
  console.log(`  - Document IDs: ${state.documentIds?.length || 0}`);
  console.log(`  - Chunks: ${state.chunks?.length || 0}`);
  console.log(`  - Report Type: ${state.reportType}`);
  console.log(`  - Custom Prompt: ${state.customPrompt ? 'Yes (' + state.customPrompt.length + ' chars)' : 'No'}`);

  return state;
}

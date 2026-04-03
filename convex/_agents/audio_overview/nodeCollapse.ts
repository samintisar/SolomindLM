"use node"

import { countTokens } from '../_shared/index.js';
import type { JobLogger } from '../_shared/logging.js';
import { createAgentGraphLogger } from '../_shared/logging.js';

import { GRAPH_CONFIG } from './config.js';
import type { OverallStateType } from './state.js';

/**
 * Recursively collapses multiple outputs into fewer chunks using actual token counting.
 */
export async function recursiveCollapse(
  outputs: string[],
  maxTokens: number,
  logger: JobLogger
): Promise<string[]> {
  if (outputs.length <= 3) {
    return outputs;
  }

  // Calculate total tokens using actual counting
  const totalTokens = outputs.reduce((sum, s) => sum + countTokens(s), 0);

  // If already under the limit, no need to collapse
  if (totalTokens <= maxTokens) {
    return outputs;
  }

  // Group outputs to stay under token limit
  const collapsed: string[] = [];
  let currentGroup: string[] = [];
  let currentTokens = 0;

  for (const output of outputs) {
    const tokens = countTokens(output);
    if (currentTokens + tokens > maxTokens && currentGroup.length > 0) {
      collapsed.push(currentGroup.join('\n\n---\n\n'));
      currentGroup = [output];
      currentTokens = tokens;
    } else {
      currentGroup.push(output);
      currentTokens += tokens;
    }
  }

  if (currentGroup.length > 0) {
    collapsed.push(currentGroup.join('\n\n---\n\n'));
  }

  logger.info(`Recursive collapse: ${outputs.length} -> ${collapsed.length} (${totalTokens} tokens)`, {
    agent: 'AudioOverviewGraph',
    phase: 'recursive_collapse',
    inputCount: outputs.length,
    outputCount: collapsed.length,
    totalTokens,
  });

  return collapsed;
}

/**
 * Collapse map outputs into fewer chunks (collapse phase).
 */
export async function collapse(
  state: OverallStateType
): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger('AudioOverviewGraph', 'audio');
  const { mapOutputs } = state;

  logger.phaseStart('collapse', {
    agent: 'AudioOverviewGraph',
    inputCount: mapOutputs.length,
  });

  const collapsed = await recursiveCollapse(mapOutputs, GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS / 2, logger);

  logger.info(`Collapsed ${mapOutputs.length} outputs to ${collapsed.length}`, {
    agent: 'AudioOverviewGraph',
    phase: 'collapse',
    outputCount: collapsed.length,
  });

  return {
    ...state,
    collapsedOutputs: collapsed,
    status: 'reducing',
    progress: {
      phase: 'collapse',
      percentage: 50,
      message: `Consolidated ${mapOutputs.length} chunks`,
    },
  };
}

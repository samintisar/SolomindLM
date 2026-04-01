"use node"

import {
  clearStateKeys,
  logError,
  logInfo,
  logWarn,
} from '../_shared/index.js';

import { GRAPH_CONFIG } from './config.js';
import type { SlideCandidate } from './prompts.js';
import { callStatusUpdate } from './nodeSplit.js';
import type { OverallStateType } from './state.js';

export interface CollapseNodeDeps {
  estimateTokens: (text: string) => number;
}

async function collapseGroup(group: string[]): Promise<string> {
  const allSlides: SlideCandidate[] = [];
  for (const output of group) {
    try {
      const parsed = JSON.parse(output) as SlideCandidate[];
      allSlides.push(...parsed);
    } catch (e) {
      logWarn(
        {
          agent: 'SlideDeckGraph',
          phase: 'collapse_group_parse_error',
          error: e instanceof Error ? e.message : String(e),
        },
        'Failed to parse slide array in collapseGroup'
      );
    }
  }

  const seen = new Set<string>();
  const uniqueSlides = allSlides.filter((slide) => {
    const key = slide.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logInfo(
    {
      agent: 'SlideDeckGraph',
      phase: 'collapse_group',
      inputSlides: allSlides.length,
      uniqueSlides: uniqueSlides.length,
    },
    `Collapsed ${allSlides.length} → ${uniqueSlides.length} unique slides`
  );

  return JSON.stringify(uniqueSlides);
}

async function recursiveCollapse(
  outputs: string[],
  estimateTokens: (text: string) => number,
  depth: number = 0
): Promise<string[]> {
  if (depth >= GRAPH_CONFIG.MAX_COLLAPSE_DEPTH) {
    logWarn(
      {
        agent: 'SlideDeckGraph',
        phase: 'recursive_collapse',
        depth,
        maxDepth: GRAPH_CONFIG.MAX_COLLAPSE_DEPTH,
        outputCount: outputs.length,
      },
      `Max collapse depth (${GRAPH_CONFIG.MAX_COLLAPSE_DEPTH}) reached, returning current outputs`
    );
    return outputs;
  }

  const totalTokens = outputs.reduce((sum, s) => sum + estimateTokens(s), 0);

  if (totalTokens <= GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
    return outputs;
  }

  const targetGroupTokens = GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS * 0.8;
  const collapsed: string[] = [];
  let currentGroup: string[] = [];
  let currentTokens = 0;

  for (const output of outputs) {
    const tokens = estimateTokens(output);
    if (currentTokens + tokens > targetGroupTokens && currentGroup.length > 0) {
      collapsed.push(await collapseGroup(currentGroup));
      currentGroup = [output];
      currentTokens = tokens;
    } else {
      currentGroup.push(output);
      currentTokens += tokens;
    }
  }

  if (currentGroup.length > 0) {
    collapsed.push(await collapseGroup(currentGroup));
  }

  return recursiveCollapse(collapsed, estimateTokens, depth + 1);
}

export async function collapse(
  state: OverallStateType,
  deps: CollapseNodeDeps
): Promise<Partial<OverallStateType>> {
  console.log(`\n${'='.repeat(80)}`);
  console.log('[SlideDeckGraph] ===== COLLAPSE PHASE =====');
  console.log('='.repeat(80));

  const mapOutputsDetails = state.mapOutputs.map((output, idx) => {
    let slides = 0;
    try {
      const parsed = JSON.parse(output) as SlideCandidate[];
      slides = parsed.length;
    } catch {
      slides = 0;
    }
    return {
      index: idx,
      tokens: deps.estimateTokens(output),
      slides,
      preview: output.substring(0, 100).replace(/\n/g, ' '),
    };
  });

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: 'collapse',
        mapOutputsReceived: state.mapOutputs.length,
        mapOutputsDetails,
      },
      null,
      2
    )
  );

  if (!state.mapOutputs || state.mapOutputs.length === 0) {
    logError(
      {
        agent: 'SlideDeckGraph',
        phase: 'collapse',
        error: 'No mapOutputs received',
      },
      'Collapse: ERROR - No mapOutputs received!'
    );
    await callStatusUpdate(state, 'collapsing');
    return {
      ...state,
      collapsedOutputs: [],
      status: 'reducing',
    };
  }

  const totalTokens = state.mapOutputs.reduce((sum, s) => sum + deps.estimateTokens(s), 0);

  logInfo(
    {
      agent: 'SlideDeckGraph',
      phase: 'collapse',
      totalTokens,
      reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
    },
    `Total tokens: ${totalTokens}, Reduce chunk size: ${GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS} tokens`
  );

  await callStatusUpdate(state, 'collapsing');

  if (totalTokens <= GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
    logInfo(
      {
        agent: 'SlideDeckGraph',
        phase: 'collapse_skip',
        totalTokens,
        reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
      },
      'Collapse: skipping recursive collapse, using mapOutputs directly'
    );

    const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
    logInfo(
      {
        agent: 'SlideDeckGraph',
        phase: 'collapse_cleanup',
        memoryFreedKB: (mapOutputsSize / 1024).toFixed(2),
      },
      `Freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`
    );

    return {
      ...state,
      collapsedOutputs: state.mapOutputs,
      status: 'reducing',
      ...clearStateKeys<OverallStateType>(['mapOutputs']),
      progress: {
        phase: 'collapse',
        percentage: 70,
        message: `Collected ${state.mapOutputs.length} chunk outputs`,
      },
    };
  }

  logInfo(
    {
      agent: 'SlideDeckGraph',
      phase: 'collapse_recursive',
      totalTokens,
      reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
    },
    'Collapse: performing recursive collapse'
  );
  const collapsed = await recursiveCollapse(state.mapOutputs, deps.estimateTokens);

  const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
  logInfo(
    {
      agent: 'SlideDeckGraph',
      phase: 'collapse_cleanup',
      memoryFreedKB: (mapOutputsSize / 1024).toFixed(2),
    },
    `Freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`
  );

  return {
    ...state,
    collapsedOutputs: collapsed,
    status: 'reducing',
    ...clearStateKeys<OverallStateType>(['mapOutputs']),
    progress: {
      phase: 'collapse',
      percentage: 70,
      message: `Collapsed ${state.mapOutputs.length} outputs into ${collapsed.length}`,
    },
  };
}

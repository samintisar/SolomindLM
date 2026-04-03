"use node"

import { createAgentGraphLogger } from '../_shared/logging.js';

import type { ConceptExtraction, FinalMindMap, MindMapNode } from './state.js';

/**
 * Creates a meaningful fallback tree
 */
export function createSmartFallback(extractions: ConceptExtraction[]): FinalMindMap {
  const logger = createAgentGraphLogger('MindMapGraph', 'mindmap');
  const themeCounts: Record<string, number> = {};
  extractions.forEach(e => {
    const t = e.main_theme || 'Unknown';
    themeCounts[t] = (themeCounts[t] || 0) + 1;
  });

  const rootTitle = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Knowledge Map';

  logger.info(`Fallback root: "${rootTitle}"`, {
    agent: 'MindMapGraph',
    phase: 'fallback',
    rootTitle,
    themeCounts,
  });

  const seenThemes = new Set<string>();
  const children: MindMapNode[] = [];

  for (const ex of extractions) {
    const theme = ex.main_theme || 'Misc';
    if (seenThemes.has(theme)) continue;
    seenThemes.add(theme);

    const branchName = theme === rootTitle ? 'Overview' : theme;

    children.push({
      topic: branchName,
      children: ex.key_concepts.map(c => ({
        topic: c,
        children: null,
      })),
    });
  }

  logger.info(`Fallback: ${children.length} branches`, {
    agent: 'MindMapGraph',
    phase: 'fallback',
    branchCount: children.length,
  });

  return {
    nodeData: {
      topic: rootTitle,
      children: children.length > 0 ? children : null,
    },
  };
}

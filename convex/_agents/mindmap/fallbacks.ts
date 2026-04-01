"use node"

import { logInfo } from '../_shared/index.js';

import type { ConceptExtraction, FinalMindMap, MindMapNode } from './state.js';

/**
 * Creates a meaningful fallback tree
 */
export function createSmartFallback(extractions: ConceptExtraction[]): FinalMindMap {
  const themeCounts: Record<string, number> = {};
  extractions.forEach(e => {
    const t = e.main_theme || 'Unknown';
    themeCounts[t] = (themeCounts[t] || 0) + 1;
  });

  const rootTitle = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Knowledge Map';

  logInfo({
    agent: 'MindMapGraph',
    phase: 'fallback',
    rootTitle,
    themeCounts,
  }, `Fallback root: "${rootTitle}"`);

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

  logInfo({
    agent: 'MindMapGraph',
    phase: 'fallback',
    branchCount: children.length,
  }, `Fallback: ${children.length} branches`);

  return {
    nodeData: {
      topic: rootTitle,
      children: children.length > 0 ? children : null,
    },
  };
}

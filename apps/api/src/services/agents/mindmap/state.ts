/**
 * State definitions for MindMapGraph.
 *
 * Contains state interfaces and types using the LangGraph Annotation API.
 */

import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';

// ============================================================
// SCHEMAS
// ============================================================

const ConceptExtractionSchema = z.object({
  main_theme: z.string(),
  summary: z.string(),
  key_concepts: z.array(z.string()),
});

export interface ConceptExtraction {
  main_theme: string;
  summary: string;
  key_concepts: string[];
}

export interface MindMapNode {
  topic: string;
  children: MindMapNode[] | null;
}

export interface FinalMindMap {
  nodeData: MindMapNode;
}

// ============================================================
// STATE DEFINITIONS
// ============================================================

export const ChunkState = Annotation.Root({
  content: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => '' }),
  retryCount: Annotation<number>({ reducer: (x, y) => y ?? x, default: () => 0 }),
  chunkIndex: Annotation<number>({ reducer: (x, y) => y ?? x, default: () => 0 }),
  totalChunks: Annotation<number>({ reducer: (x, y) => y ?? x, default: () => 0 }),
});

export const OverallState = Annotation.Root({
  allChunks: Annotation<string[]>({ reducer: (x, y) => y ?? x, default: () => [] }),
  extractedConcepts: Annotation<ConceptExtraction[]>({
    reducer: (existing, incoming) => {
      const combined = [...existing, ...(incoming ?? [])];

      const seen = new Set<string>();
      return combined.filter(item => {
        const key = `${item.main_theme}|${item.summary}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
    },
    default: () => []
  }),
  finalOutput: Annotation<any>({ reducer: (x, y) => y ?? x, default: () => null }),
  status: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => 'generating' }),
  progress: Annotation<{
    phase: string;
    percentage: number;
    message: string;
    chunksCompleted?: number;
    totalChunks?: number;
    conceptsExtracted?: number;
  }>({
    reducer: (_x, y?: any) => y ?? _x,
    default: () => ({ phase: 'initializing', percentage: 0, message: 'Initializing...' }),
  }),
});

export type OverallStateType = typeof OverallState.State;
export type ChunkStateType = typeof ChunkState.State;

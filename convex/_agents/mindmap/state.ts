"use node";
/**
 * State definitions for MindMapGraph.
 *
 * Contains state interfaces and types using the LangGraph Annotation API.
 */

import { Annotation } from "@langchain/langgraph";

// ============================================================
// TYPES
// ============================================================

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
  content: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => "" }),
  retryCount: Annotation<number>({ reducer: (x, y) => y ?? x, default: () => 0 }),
  chunkIndex: Annotation<number>({ reducer: (x, y) => y ?? x, default: () => 0 }),
  totalChunks: Annotation<number>({ reducer: (x, y) => y ?? x, default: () => 0 }),
});

export const OverallState = Annotation.Root({
  allChunks: Annotation<string[]>({ reducer: (x, y) => y ?? x, default: () => [] }),
  /** Count of chunks that failed permanently after retries (summed across parallel map workers). */
  permanentMapFailures: Annotation<number>({
    reducer: (a, b) => a + (b ?? 0),
    default: () => 0,
  }),
  extractedConcepts: Annotation<ConceptExtraction[]>({
    reducer: (existing, incoming) => {
      if (incoming === null) return [];
      const combined = [...existing, ...(incoming ?? [])];

      const seen = new Set<string>();
      return combined.filter((item) => {
        const key = `${item.main_theme}|${item.summary}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
    },
    default: () => [],
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  finalOutput: Annotation<any>({ reducer: (x, y) => y ?? x, default: () => null }),
  status: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => "generating" }),
  progress: Annotation<{
    phase: string;
    percentage: number;
    message: string;
    chunksCompleted?: number;
    totalChunks?: number;
    conceptsExtracted?: number;
  }>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reducer: (_x, y?: any) => y ?? _x,
    default: () => ({ phase: "initializing", percentage: 0, message: "Initializing..." }),
  }),
});

export type OverallStateType = typeof OverallState.State;
export type ChunkStateType = typeof ChunkState.State;

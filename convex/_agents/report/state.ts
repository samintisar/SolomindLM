"use node";
/**
 * State definitions for ReportGraph.
 *
 * Contains state interfaces using the LangGraph Annotation API.
 */

import { Annotation } from "@langchain/langgraph";
import { mapOutputsMergeReducer } from "../_shared/stateUpdateHelpers.js";

// ============================================================
// STATE DEFINITIONS
// ============================================================

/**
 * Overall state for the report generation graph.
 * Uses Langgraph's Annotation API for state management.
 */
export const OverallState = Annotation.Root({
  documentIds: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  chunks: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  reportType: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  customPrompt: Annotation<string | undefined>({
    reducer: (_x: string | undefined, y?: string | undefined) => y ?? _x,
    default: () => undefined,
  }),
  mapOutputs: Annotation<string[]>({
    reducer: (x, y) => mapOutputsMergeReducer(x, y),
    default: () => [],
  }),
  collapsedOutputs: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  finalOutput: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  status: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "generating",
  }),
  reduceRetryCount: Annotation<number>({
    reducer: (_x: number, y?: number) => y ?? _x,
    default: () => 0,
  }),
  // Progress tracking for streaming
  progress: Annotation<{
    phase: string;
    percentage: number;
    message: string;
    chunksCompleted?: number;
    totalChunks?: number;
  }>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reducer: (_x, y?: any) => y ?? _x,
    default: () => ({ phase: "initializing", percentage: 0, message: "Initializing..." }),
  }),
});

export type OverallStateType = typeof OverallState.State;

/**
 * Minimal state for parallel map processing - only what each chunk needs.
 */
export interface ChunkProcessState {
  chunk: string;
  chunkIndex?: number; // Track which chunk this is for debugging
  totalChunks?: number; // Total chunks for progress tracking
  reportType: string;
  customPrompt?: string;
}

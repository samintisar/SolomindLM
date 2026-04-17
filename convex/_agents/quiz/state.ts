"use node";
/**
 * State definitions for QuizGraph.
 *
 * Contains state interfaces using the LangGraph Annotation API.
 */

import { Annotation } from "@langchain/langgraph";
import type { QuizQuestion } from "./prompts.js";

// ============================================================
// STATE DEFINITIONS
// ============================================================

/**
 * Overall state for the quiz generation graph.
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
  questionCount: Annotation<number>({
    reducer: (_x: number, y?: number) => y ?? _x,
    default: () => 20,
  }),
  difficulty: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "medium",
  }),
  focus: Annotation<string | undefined>({
    reducer: (_x: string | undefined, y?: string | undefined) => y ?? _x,
    default: () => undefined,
  }),
  mapOutputs: Annotation<string[]>({
    reducer: (x: string[], y?: string[]) => (y ? x.concat(y) : x),
    default: () => [],
  }),
  collapsedOutputs: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  finalOutput: Annotation<QuizQuestion[]>({
    reducer: (_x: QuizQuestion[], y?: QuizQuestion[]) => y ?? _x,
    default: () => [],
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
    itemsGenerated?: number;
  }>({
    reducer: (_x, y?: any) => y ?? _x,
    default: () => ({ phase: "initializing", percentage: 0, message: "Initializing..." }),
  }),
  // Callback for progress updates (not stored in state, passed through)
  onStatusUpdate: Annotation<((status: string) => void | Promise<void>) | undefined>({
    reducer: (_x, y?: any) => y ?? _x,
    default: () => undefined,
  }),
});

export type OverallStateType = typeof OverallState.State;

/**
 * Minimal state for parallel map processing.
 */
export interface ChunkProcessState {
  chunk: string;
  chunkIndex?: number;
  questionCount: number;
  difficulty: string;
  focus?: string;
  questionsPerChunk: number;
}

// Re-export QuizQuestion type for convenience
export type { QuizQuestion } from "./prompts.js";

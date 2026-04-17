"use node";
/**
 * State definitions for FlashcardGraph.
 *
 * Contains state interfaces using the LangGraph Annotation API.
 */

import { Annotation } from "@langchain/langgraph";
import type { Flashcard } from "./prompts.js";

// ============================================================
// STATE DEFINITIONS
// ============================================================

/**
 * Overall state for the flashcard generation graph.
 * Uses LangGraph's Annotation API for state management.
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
  cardCount: Annotation<number>({
    reducer: (_x: number, y?: number) => y ?? _x,
    default: () => 35, // standard default
  }),
  difficulty: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "medium",
  }),
  topic: Annotation<string | undefined>({
    reducer: (_x: string | undefined, y?: string | undefined) => y ?? _x,
    default: () => undefined,
  }),
  mapOutputs: Annotation<Flashcard[][]>({
    // Reducer concatenates arrays - critical for aggregating parallel outputs
    // Fixed: handle undefined y to prevent runtime errors
    reducer: (x: Flashcard[][], y?: Flashcard[][]) => (y ? x.concat(y) : x),
    default: () => [],
  }),
  collapsedOutputs: Annotation<Flashcard[][]>({
    reducer: (_x: Flashcard[][], y?: Flashcard[][]) => y ?? _x,
    default: () => [],
  }),
  finalOutput: Annotation<Flashcard[]>({
    reducer: (_x: Flashcard[], y?: Flashcard[]) => y ?? _x,
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
 * Minimal state for parallel map processing - only what each chunk needs.
 */
export interface ChunkProcessState {
  chunk: string;
  chunkIndex?: number; // Track which chunk this is for debugging
  cardCount: number;
  difficulty: string;
  topic?: string;
  cardsPerChunk: number;
}

// Re-export Flashcard type for convenience
export type { Flashcard } from "./prompts.js";

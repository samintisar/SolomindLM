"use node";
/**
 * State definitions for WikiGraph.
 *
 * Contains state interfaces using the LangGraph Annotation API.
 * Follows project's map-reduce pattern for parallel chunk processing.
 */

import { Annotation } from "@langchain/langgraph";
import type { WikiArticle, ConceptExtraction } from "./prompts.js";

// ============================================================
// STATE DEFINITIONS
// ============================================================

/**
 * Overall state for the wiki generation graph.
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
  wikiId: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  notebookId: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  userId: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  // Map phase outputs - parallel concept extraction from chunks
  mapOutputs: Annotation<ConceptExtraction[][]>({
    reducer: (x: ConceptExtraction[][], y?: ConceptExtraction[][]) => (y ? x.concat(y) : x),
    default: () => [],
  }),
  // Collapsed concepts after deduplication/merging
  collapsedConcepts: Annotation<ConceptExtraction[]>({
    reducer: (_x: ConceptExtraction[], y?: ConceptExtraction[]) => y ?? _x,
    default: () => [],
  }),
  // Final output - compiled wiki articles
  finalOutput: Annotation<WikiArticle[]>({
    reducer: (_x: WikiArticle[], y?: WikiArticle[]) => y ?? _x,
    default: () => [],
  }),
  // Temporary storage for concept articles (used during reduce phase)
  conceptArticles: Annotation<WikiArticle[]>({
    reducer: (_x: WikiArticle[], y?: WikiArticle[]) => y ?? _x,
    default: () => [],
  }),
  // Temporary storage for connection articles (used during reduce phase)
  connectionArticles: Annotation<WikiArticle[]>({
    reducer: (_x: WikiArticle[], y?: WikiArticle[]) => y ?? _x,
    default: () => [],
  }),
  // Index and log content
  indexContent: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  logContent: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  status: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "draft",
  }),
  // Progress tracking for streaming updates
  progress: Annotation<{
    phase: string;
    percentage: number;
    message: string;
    conceptsExtracted?: number;
    articlesGenerated?: number;
    chunksCompleted?: number;
    totalChunks?: number;
  }>({
    reducer: (_x, y?: any) => y ?? _x,
    default: () => ({
      phase: "initializing",
      percentage: 0,
      message: "Initializing wiki compilation...",
    }),
  }),
});

export type OverallStateType = typeof OverallState.State;

/**
 * Chunk-level state for parallel concept extraction.
 * Each chunk processes independently with only the data it needs.
 */
export const ChunkProcessState = Annotation.Root({
  chunk: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  chunkIndex: Annotation<number>({
    reducer: (_x: number, y?: number) => y ?? _x,
    default: () => 0,
  }),
  totalChunks: Annotation<number>({
    reducer: (_x: number, y?: number) => y ?? _x,
    default: () => 0,
  }),
  documentIds: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  wikiId: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  notebookId: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  userId: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
});

export type ChunkProcessStateType = typeof ChunkProcessState.State;

// Re-export types for convenience
export type { WikiArticle, ConceptExtraction } from "./prompts.js";

"use node"
/**
 * State definitions for SlideDeckGraph.
 *
 * Contains state interfaces using the LangGraph Annotation API.
 */

import { Annotation } from '@langchain/langgraph';
import type { ProgressInfo } from '../_shared/index.js';
import type { Slide } from './prompts.js';

// ============================================================
// STATE DEFINITIONS
// ============================================================

/**
 * Overall state for the slide deck generation graph.
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
  slideType: Annotation<'detailed_deck' | 'presenter_slides'>({
    reducer: (_x: 'detailed_deck' | 'presenter_slides', y?: 'detailed_deck' | 'presenter_slides') => y ?? _x,
    default: () => 'detailed_deck',
  }),
  deckLength: Annotation<'short' | 'default'>({
    reducer: (_x: 'short' | 'default', y?: 'short' | 'default') => y ?? _x,
    default: () => 'default',
  }),
  customPrompt: Annotation<string | undefined>({
    reducer: (_x: string | undefined, y?: string | undefined) => y ?? _x,
    default: () => undefined,
  }),
  themeSpecification: Annotation<string | undefined>({
    reducer: (_x: string | undefined, y?: string | undefined) => y ?? _x,
    default: () => undefined,
  }),
  title: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => 'Untitled Presentation',
  }),
  mapOutputs: Annotation<string[]>({
    reducer: (x: string[], y?: string[]) => y ? x.concat(y) : x,
    default: () => [],
  }),
  collapsedOutputs: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  finalOutput: Annotation<Slide[]>({
    reducer: (_x: Slide[], y?: Slide[]) => y ?? _x,
    default: () => [],
  }),
  slidesWithPrompts: Annotation<Slide[]>({
    reducer: (_x: Slide[], y?: Slide[]) => y ?? _x,
    default: () => [],
  }),
  status: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => 'generating',
  }),
  // Progress tracking for streaming
  progress: Annotation<ProgressInfo>({
    reducer: (_x, y?: ProgressInfo) => y ?? _x,
    default: () => ({ phase: 'initializing', percentage: 0, message: 'Initializing...' }),
  }),
  // Callback for progress updates (not stored in state, passed through)
  onStatusUpdate: Annotation<((status: string) => void | Promise<void>) | undefined>({
    reducer: (_x, y?: any) => y ?? _x,
    default: () => undefined,
  }),
});;

export type OverallStateType = typeof OverallState.State;

/**
 * Minimal state for parallel map processing.
 */
export interface ChunkProcessState {
  chunk: string;
  chunkIndex?: number;
  slideType: 'detailed_deck' | 'presenter_slides';
  deckLength: 'short' | 'default';
  customPrompt?: string;
  slidesPerChunk: number;
  targetSlideCount: number;
}

// Re-export Slide type for convenience
export type { Slide } from './prompts.js';

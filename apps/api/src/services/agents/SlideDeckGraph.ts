/**
 * SlideDeckGraph
 *
 * Orchestrates AI-generated presentation slide deck creation.
 *
 * This implementation uses composition patterns with dedicated modules:
 * - prompts.ts: All prompt templates, types, and constants
 * - state.ts: State definitions using the Annotation API
 * - nodes.ts: Node functions and the main class
 *
 * Main export: SlideDeckGraph class
 */

// Re-export the main class from nodes module
export { SlideDeckGraph, packChunks, validateChunks } from './slides/nodes.js';

// Re-export types for backward compatibility
export type {
  OverallStateType,
  ChunkProcessState,
  Slide,
} from './slides/state.js';

export type {
  SlideCandidateResponse,
  SlideResponse,
} from './slides/prompts.js';

// Re-export constants for backward compatibility
export { GRAPH_CONFIG, SLIDE_COUNT_MAP } from './slides/prompts.js';

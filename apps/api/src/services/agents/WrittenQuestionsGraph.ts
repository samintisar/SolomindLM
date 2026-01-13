/**
 * WrittenQuestionsGraph
 *
 * Orchestrates written question generation using extracted modules.
 *
 * This refactored version uses composition patterns with dedicated modules:
 * - prompts.ts: All prompt templates, types, and constants
 * - state.ts: State definitions using the Annotation API
 * - nodes.ts: Node functions and the main class
 *
 * Main export: WrittenQuestionsGraph class
 */

// Re-export the main class from nodes module
export { WrittenQuestionsGraph, packChunks, validateChunks } from './written-questions/nodes.js';

// Re-export types for backward compatibility
export type {
  OverallStateType,
  ChunkProcessState,
  WrittenQuestion,
} from './written-questions/state.js';

export type {
  WrittenQuestionsResponse,
} from './written-questions/prompts.js';

// Re-export constants for backward compatibility
export { PROBLEMATIC_PHRASES, GRAPH_CONFIG } from './written-questions/prompts.js';

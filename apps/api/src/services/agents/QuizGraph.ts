/**
 * QuizGraph
 *
 * Orchestrates quiz question generation using extracted modules.
 *
 * This refactored version uses composition patterns with dedicated modules:
 * - prompts.ts: All prompt templates, types, and constants
 * - state.ts: State definitions using the Annotation API
 * - nodes.ts: Node functions and the main class
 *
 * Main export: QuizGraph class
 */

// Re-export the main class from nodes module
export { QuizGraph, packChunks, validateChunks } from './quiz/nodes.js';

// Re-export types for backward compatibility
export type {
  OverallStateType,
  ChunkProcessState,
  QuizQuestion,
} from './quiz/state.js';

export type {
  QuizQuestionResponse,
} from './quiz/prompts.js';

// Re-export constants for backward compatibility
export { GRAPH_CONFIG } from './quiz/prompts.js';

"use node";

/**
 * WrittenQuestionsGraph
 *
 * Orchestrates written question generation using extracted modules.
 *
 * This refactored version uses composition patterns with dedicated modules:
 * - prompts.ts: All prompt templates, types, and constants
 * - state.ts: State definitions using the Annotation API
 * - WrittenQuestionsGraph.ts: Graph orchestration; node modules for each phase
 *
 * Main export: WrittenQuestionsGraph class
 */

export type { WrittenQuestionsResponse } from "./written_questions/prompts.js";
// Re-export constants for backward compatibility
export { GRAPH_CONFIG, PROBLEMATIC_PHRASES } from "./written_questions/prompts.js";
// Re-export types for backward compatibility
export type {
  ChunkProcessState,
  OverallStateType,
  WrittenQuestion,
} from "./written_questions/state.js";
export {
  packChunks,
  validateChunks,
  WrittenQuestionsGraph,
} from "./written_questions/WrittenQuestionsGraph.js";

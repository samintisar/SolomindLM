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

export {
  WrittenQuestionsGraph,
  packChunks,
  validateChunks,
} from "./written_questions/WrittenQuestionsGraph.js";

// Re-export types for backward compatibility
export type {
  OverallStateType,
  ChunkProcessState,
  WrittenQuestion,
} from "./written_questions/state.js";

export type { WrittenQuestionsResponse } from "./written_questions/prompts.js";

// Re-export constants for backward compatibility
export { PROBLEMATIC_PHRASES, GRAPH_CONFIG } from "./written_questions/prompts.js";

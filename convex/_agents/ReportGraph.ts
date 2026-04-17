"use node";
/**
 * ReportGraph
 *
 * Orchestrates report generation using extracted modules.
 *
 * This refactored version uses composition patterns with dedicated modules:
 * - prompts.ts: All prompt templates for different report types
 * - state.ts: State definitions using the Annotation API
 * - report/ReportGraph.ts: graph class; node modules under report/
 *
 * Main export: ReportGraph class
 */

// Re-export the main class from nodes module
export { ReportGraph, packChunks, validateChunks } from "./report/ReportGraph.js";

// Re-export types for backward compatibility
export type { OverallStateType, ChunkProcessState } from "./report/state.js";

// Re-export prompt constants for backward compatibility
export { MAP_PROMPTS, REDUCE_PROMPTS } from "./report/prompts.js";

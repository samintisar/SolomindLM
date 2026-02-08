"use node"
/**
 * SpreadsheetGraph
 *
 * Orchestrates spreadsheet generation using extracted modules.
 *
 * This mirrors the ReportGraph architecture but generates structured tables/spreadsheets
 * instead of narrative reports. Uses the dedicated spreadsheets table instead of the
 * notes table with note_type discriminator.
 *
 * Main export: SpreadsheetGraph class
 */

// Re-export the main class from nodes module
export { SpreadsheetGraph, packChunks, validateChunks } from './spreadsheet/nodes.js';

// Re-export types for backward compatibility
export type {
  OverallStateType,
  ChunkProcessState,
} from './spreadsheet/state.js';

// Re-export prompt constants for backward compatibility
export { MAP_PROMPTS, REDUCE_PROMPTS } from './spreadsheet/prompts.js';

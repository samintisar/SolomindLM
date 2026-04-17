"use node";
/**
 * SpreadsheetGraph
 *
 * Orchestrates spreadsheet generation; implementation lives under `spreadsheet/`.
 *
 * This mirrors the ReportGraph architecture but generates structured tables/spreadsheets
 * instead of narrative reports. Uses the dedicated spreadsheets table instead of the
 * notes table with note_type discriminator.
 *
 * Main export: SpreadsheetGraph class
 */

export { SpreadsheetGraph } from "./spreadsheet/SpreadsheetGraph.js";
export { packChunks, validateChunks } from "./spreadsheet/chunkHelpers.js";

// Re-export types for backward compatibility
export type { OverallStateType, ChunkProcessState } from "./spreadsheet/state.js";

// Re-export prompt constants for backward compatibility
export { MAP_PROMPTS, REDUCE_PROMPTS } from "./spreadsheet/prompts.js";

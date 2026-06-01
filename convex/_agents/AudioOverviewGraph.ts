"use node";
/**
 * AudioOverviewGraph
 *
 * Orchestrates audio overview generation using extracted modules.
 *
 * This refactored version uses composition patterns with dedicated modules:
 * - prompts.ts: All prompt templates
 * - state.ts: State definitions using factory composable
 * - audio_overview/*.ts: Node phases, config, and AudioOverviewGraph orchestration
 *
 * Main export: AudioOverviewGraph class
 */

export { AudioOverviewGraph } from "./audio_overview/AudioOverviewGraph.js";
export type { AudioLength, AudioType } from "./audio_overview/prompts.js";
// Re-export constants for backward compatibility
export {
  DIALOGUE_CHUNK_SIZE,
  ESTIMATED_WORDS_PER_LINE,
  MAP_PROMPTS,
  REDUCE_PROMPT,
  TARGET_LINE_COUNTS,
} from "./audio_overview/prompts.js";
// Re-export types for backward compatibility
export type { ChunkProcessState, DialogueLine, OverallStateType } from "./audio_overview/state.js";

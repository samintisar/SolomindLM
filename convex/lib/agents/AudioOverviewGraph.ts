"use node"
/**
 * AudioOverviewGraph
 *
 * Orchestrates audio overview generation using extracted modules.
 *
 * This refactored version uses composition patterns with dedicated modules:
 * - prompts.ts: All prompt templates
 * - state.ts: State definitions using factory composable
 * - nodes.ts: Node functions and graph building
 *
 * Main export: AudioOverviewGraph class
 */

// Re-export the main class from nodes module
export { AudioOverviewGraph } from './audio_overview/nodes.js';

// Re-export types for backward compatibility
export type {
  DialogueLine,
  OverallStateType,
  ChunkProcessState,
} from './audio_overview/state.js';

export type {
  AudioType,
  AudioLength,
} from './audio_overview/prompts.js';

// Re-export constants for backward compatibility
export {
  TARGET_LINE_COUNTS,
  ESTIMATED_WORDS_PER_LINE,
  DIALOGUE_CHUNK_SIZE,
  MAP_PROMPTS,
  REDUCE_PROMPT,
} from './audio_overview/prompts.js';

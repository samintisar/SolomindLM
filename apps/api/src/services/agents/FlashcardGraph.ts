/**
 * FlashcardGraph
 *
 * Orchestrates flashcard generation using extracted modules.
 *
 * This refactored version uses composition patterns with dedicated modules:
 * - prompts.ts: All prompt templates, types, and constants
 * - state.ts: State definitions using the Annotation API
 * - nodes.ts: Node functions and the main class
 *
 * Main export: FlashcardGraph class
 */

// Re-export the main class from nodes module
export { FlashcardGraph, packChunks, validateChunks } from './flashcard/nodes.js';

// Re-export types for backward compatibility
export type {
  OverallStateType,
  ChunkProcessState,
  Flashcard,
} from './flashcard/state.js';

export type {
  FlashcardResponse,
} from './flashcard/prompts.js';

// Re-export constants for backward compatibility
export { PROBLEMATIC_PHRASES } from './flashcard/prompts.js';

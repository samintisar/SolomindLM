"use node"
/**
 * FlashcardGraph
 *
 * Public flashcard agent wrapper and backward-compatible re-exports.
 */

export { FlashcardGraph } from './flashcard/FlashcardGraph.js';
export { packChunks, validateChunks } from './flashcard/chunkHelpers.js';

export type {
  OverallStateType,
  ChunkProcessState,
  Flashcard,
} from './flashcard/state.js';

export type {
  FlashcardResponse,
} from './flashcard/prompts.js';

export { PROBLEMATIC_PHRASES } from './flashcard/prompts.js';

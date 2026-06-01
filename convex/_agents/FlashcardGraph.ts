"use node";

/**
 * FlashcardGraph
 *
 * Public flashcard agent wrapper and backward-compatible re-exports.
 */

export { packChunks, validateChunks } from "./flashcard/chunkHelpers.js";
export { FlashcardGraph } from "./flashcard/FlashcardGraph.js";
export type { FlashcardResponse } from "./flashcard/prompts.js";
export { PROBLEMATIC_PHRASES } from "./flashcard/prompts.js";
export type { ChunkProcessState, Flashcard, OverallStateType } from "./flashcard/state.js";

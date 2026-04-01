"use node"
/**
 * SlideDeckGraph
 *
 * Orchestrates AI-generated presentation slide deck creation.
 *
 * This implementation uses composition patterns with dedicated modules under `slides/`.
 */

export { SlideDeckGraph, packChunks, validateChunks } from './slides/SlideDeckGraph.js';

export type {
  OverallStateType,
  ChunkProcessState,
  Slide,
} from './slides/state.js';

export type {
  SlideCandidateResponse,
  SlideResponse,
} from './slides/prompts.js';

export { GRAPH_CONFIG, SLIDE_COUNT_MAP } from './slides/prompts.js';

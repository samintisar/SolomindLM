"use node"
/**
 * MindMapGraph
 *
 * Orchestrates mind map generation using extracted modules.
 *
 * This refactored version uses composition patterns with dedicated modules:
 * - prompts.ts: All prompt templates
 * - state.ts: State definitions using the Annotation API
 * - mindmap/MindMapGraph.ts: Graph class, node wiring, and chunk helpers
 *
 * Main export: MindMapGraph class
 */

export { MindMapGraph, packChunks, validateChunks } from './mindmap/MindMapGraph.js';

// Re-export types for backward compatibility
export type {
  OverallStateType,
  ChunkStateType,
  ConceptExtraction,
  MindMapNode,
  FinalMindMap,
} from './mindmap/state.js';

// Re-export constants for backward compatibility
export { NODES, MAP_PROMPT, REDUCE_PROMPT } from './mindmap/prompts.js';

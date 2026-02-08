"use node"
/**
 * MindMapGraph
 *
 * Orchestrates mind map generation using extracted modules.
 *
 * This refactored version uses composition patterns with dedicated modules:
 * - prompts.ts: All prompt templates
 * - state.ts: State definitions using the Annotation API
 * - nodes.ts: Node functions and the main class
 *
 * Main export: MindMapGraph class
 */

// Re-export the main class from nodes module
export { MindMapGraph, packChunks, validateChunks } from './mindmap/nodes.js';

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

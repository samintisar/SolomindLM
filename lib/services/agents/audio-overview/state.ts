"use node"
/**
 * State definitions for AudioOverviewGraph.
 *
 * Uses the state factory composable to create consistent state shapes
 * with custom fields for audio overview generation.
 */

import { Annotation } from '@langchain/langgraph';
import { createGraphState, type ProgressInfo } from '../shared/state-factory.js';
import type { AudioType, AudioLength } from './prompts.js';

// ============================================================
// Types
// ============================================================

/**
 * Dialogue line interface.
 */
export interface DialogueLine {
  speaker: 'host_a' | 'host_b';
  text: string;
}

// ============================================================
// State Definitions
// ============================================================

/**
 * Overall state for the audio overview generation graph.
 * Uses the state factory composable with custom fields.
 */
export const OverallState = createGraphState<{
  dialogueScript: DialogueLine[];
  audioBuffer: Buffer;
}>({
  customFields: {
    // Audio-specific fields
    audioType: Annotation<AudioType>({
      reducer: (_x: AudioType, y?: AudioType) => y ?? _x,
      default: () => 'deep_dive' as AudioType,
    }),

    length: Annotation<AudioLength>({
      reducer: (_x: AudioLength, y?: AudioLength) => y ?? _x,
      default: () => 'default' as AudioLength,
    }),

    focus: Annotation<string | undefined>({
      reducer: (_x: string | undefined, y?: string | undefined) => y ?? _x,
      default: () => undefined,
    }),

    // Output fields
    dialogueScript: Annotation<DialogueLine[]>({
      reducer: (_x: DialogueLine[], y?: DialogueLine[]) => y ?? _x,
      default: () => [],
    }),

    audioBuffer: Annotation<Buffer>({
      reducer: (_x: Buffer, y?: Buffer) => y ?? _x,
      default: () => Buffer.alloc(0),
    }),
  },
});

/** Type alias for the overall state */
export type OverallStateType = typeof OverallState.State;

// ============================================================
// Chunk Process State
// ============================================================

/**
 * Minimal state for parallel map processing.
 * Each chunk only needs these fields for independent processing.
 */
export interface ChunkProcessState {
  chunk: string;
  chunkIndex?: number;
  totalChunks?: number;
  audioType: AudioType;
  length: AudioLength;
  focus?: string;
}

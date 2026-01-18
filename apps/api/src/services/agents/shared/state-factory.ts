/**
 * State factory for LLM agent operations.
 *
 * Provides factory functions for creating common state shapes used across
 * all graph-based agents (MapReduce pattern).
 *
 * This eliminates the need for each agent to define similar Annotation.Root
 * state with duplicate reducer logic.
 */

import { Annotation } from '@langchain/langgraph';
import type { ProgressInfo as ProgressInfoType } from './progress.js';

// Re-export ProgressInfo for backward compatibility
export type ProgressInfo = ProgressInfoType;

// ============================================================
// State Factory Functions
// ============================================================

/**
 * Creates a standard graph state with common fields used by all MapReduce agents.
 *
 * @param options - Optional configuration
 * @param options.customFields - Custom fields to add to the state
 * @param options.outputDefault - Default value for finalOutput field
 * @returns An Annotation.Root with standard fields plus any custom fields
 *
 * @example
 * ```typescript
 * // Basic usage
 * const OverallState = createGraphState();
 *
 * // With custom fields
 * const OverallState = createGraphState({
 *   customFields: {
 *     cardCount: Annotation<number>({
 *       reducer: (_x: number, y?: number) => y ?? _x,
 *       default: () => 35,
 *     }),
 *   },
 * });
 *
 * // With typed output
 * interface Flashcard { front: string; back: string; }
 * const OverallState = createGraphState<Flashcard[]>({
 *   outputDefault: [] as Flashcard[],
 * });
 * ```
 */
export function createGraphState<TOutput = any>(options?: {
  customFields?: Record<string, any>;
  outputDefault?: TOutput;
}) {
  const fields: Record<string, any> = {
    // Standard fields used by all MapReduce agents
    documentIds: Annotation<string[]>({
      reducer: (_x: string[], y?: string[]) => y ?? _x,
      default: () => [],
    }),

    chunks: Annotation<string[]>({
      reducer: (_x: string[], y?: string[]) => y ?? _x,
      default: () => [],
    }),

    mapOutputs: Annotation<string[]>({
      // Reducer concatenates arrays - critical for aggregating parallel outputs
      reducer: (x: string[], y?: string[]) => y ? x.concat(y) : x,
      default: () => [],
    }),

    collapsedOutputs: Annotation<string[]>({
      reducer: (_x: string[], y?: string[]) => y ?? _x,
      default: () => [],
    }),

    finalOutput: Annotation<TOutput>({
      reducer: (_x: TOutput, y?: TOutput) => y ?? _x,
      default: () => options?.outputDefault ?? [] as TOutput,
    }),

    status: Annotation<string>({
      reducer: (_x: string, y?: string) => y ?? _x,
      default: () => 'generating',
    }),

    // Progress tracking for streaming
    progress: Annotation<ProgressInfo>({
      reducer: (x: ProgressInfo, y?: ProgressInfo) => y ?? x,
      default: () => ({
        phase: 'initializing',
        percentage: 0,
        message: 'Initializing...',
      }),
    }),
  };

  // Merge custom fields
  if (options?.customFields) {
    Object.assign(fields, options.customFields);
  }

  return Annotation.Root(fields);
}

/**
 * Creates a type for the state returned by createGraphState.
 * This provides type safety when accessing state properties.
 *
 * @example
 * ```typescript
 * const OverallState = createGraphState();
 * type OverallStateType = GraphStateType<typeof OverallState>;
 * ```
 */
export type GraphStateType<T extends ReturnType<typeof createGraphState>> = T extends ReturnType<typeof createGraphState>
  ? T['State']
  : never;

/**
 * Creates a minimal state interface for parallel map processing.
 * This is used for the state passed to individual chunks during parallel processing.
 *
 * Unlike createGraphState (which returns an Annotation), this returns a plain
 * interface type that can be used for ChunkProcessState.
 *
 * @param options - Optional configuration
 * @param options.customFields - Custom fields to add to the chunk process state
 * @returns A type that can be used for ChunkProcessState
 *
 * @example
 * ```typescript
 * // Basic usage
 * export interface ChunkProcessState extends ChunkProcessStateBase {}
 *
 * // With custom fields
 * export interface ChunkProcessState extends ChunkProcessStateBase {
 *   cardCount: number;
 *   difficulty: string;
 *   topic?: string;
 * }
 * ```
 */
export interface ChunkProcessStateBase {
  chunk: string;
  chunkIndex?: number;
  totalChunks?: number;
}

/**
 * Helper to create a chunk process state type with custom fields.
 *
 * @example
 * ```typescript
 * type FlashcardChunkState = CreateChunkProcessState<{
 *   cardCount: number;
 *   difficulty: string;
 *   topic?: string;
 * }>;
 * ```
 */
export type CreateChunkProcessState<T extends Record<string, any> = {}> = ChunkProcessStateBase & T;

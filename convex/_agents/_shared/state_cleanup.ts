"use node";
/**
 * State cleanup utilities for agent operations.
 *
 * Provides factory functions for creating cleanup nodes that clear
 * unused state data to prevent memory bloat in long-running workflows.
 *
 * This is critical for MapReduce patterns where intermediate outputs
 * (like mapOutputs, collapsedOutputs) can accumulate significant memory
 * when processing large documents.
 *
 * @example
 * ```typescript
 * import { createCleanupNode } from './shared/state-cleanup.js';
 *
 * // Add cleanup after collapse phase
 * builder.addNode('cleanup_after_collapse', createCleanupNode(['mapOutputs']));
 *
 * // Add cleanup after reduce phase
 * builder.addNode('cleanup_after_reduce', createCleanupNode(['collapsedOutputs', 'chunks']));
 * ```
 */

import type { ProgressInfo } from "./state_factory.js";

// ============================================================
// Types
// ============================================================

/**
 * Configuration for creating a cleanup node.
 */
export interface CleanupNodeConfig<TState = Record<string, unknown>> {
  /** Agent name for logging */
  agentName: string;
  /** Phase name for logging */
  phase: string;
  /** State keys to clear (set to undefined/empty) */
  keysToClear: (keyof TState & string)[];
  /** Optional progress update */
  progress?: Partial<ProgressInfo>;
}

/**
 * State cleanup result that clears specified keys.
 */
export type CleanupResult<TState = Record<string, unknown>> = {
  [K in keyof TState]?: TState[K] extends unknown[] ? [] : undefined;
};

// ============================================================
// Factory Functions
// ============================================================

/**
 * Creates a node that clears specified state keys to free memory.
 *
 * This is particularly useful in MapReduce workflows where:
 * - `mapOutputs` accumulates all chunk outputs (can be 100+ items)
 * - `collapsedOutputs` stores intermediate reduction results
 * - `chunks` holds original document text
 *
 * These should be cleared as soon as they're no longer needed to prevent
 * OOM errors in serverless environments or when using database checkpointers.
 *
 * @param config - Cleanup node configuration
 * @returns A node function that clears the specified keys
 *
 * @example
 * ```typescript
 * // Clear mapOutputs after collapse phase (it's no longer needed)
 * const cleanupAfterCollapse = createCleanupNode<OverallStateType>({
 *   agentName: 'ReportGraph',
 *   phase: 'cleanup_after_collapse',
 *   keysToClear: ['mapOutputs'],
 *   progress: {
 *     phase: 'cleanup',
 *     percentage: 75,
 *     message: 'Freed memory from map outputs',
 *   },
 * });
 *
 * // Clear collapsedOutputs after reduce phase
 * const cleanupAfterReduce = createCleanupNode<OverallStateType>({
 *   agentName: 'ReportGraph',
 *   phase: 'cleanup_after_reduce',
 *   keysToClear: ['collapsedOutputs', 'chunks'],
 *   progress: {
 *     phase: 'cleanup',
 *     percentage: 95,
 *     message: 'Freed memory from intermediate outputs',
 *   },
 * });
 * ```
 */
export function createCleanupNode<TState extends Record<string, unknown>>(
  config: CleanupNodeConfig<TState>
): (state: TState) => Partial<TState> {
  return (state: TState): Partial<TState> => {
    const { agentName, phase, keysToClear, progress } = config;

    // Log cleanup operation
    const memoryBefore = estimateStateSize(state);
    console.log(`[${agentName}] ===== STATE CLEANUP: ${phase} =====`);
    console.log(`[${agentName}] Clearing keys: ${keysToClear.join(", ")}`);
    console.log(`[${agentName}] Estimated memory before: ${formatBytes(memoryBefore)}`);

    // Build cleanup result
    const result: Partial<TState> = {};

    for (const key of keysToClear) {
      const currentValue = state[key];

      // Clear arrays to empty, others to undefined
      if (Array.isArray(currentValue)) {
        (result as Record<string, unknown>)[key] = [];
      } else {
        (result as Record<string, unknown>)[key] = undefined;
      }

      // Log what was cleared
      const size = estimateValueSize(currentValue);
      console.log(`[${agentName}] - ${String(key)}: ${formatBytes(size)} freed`);
    }

    // Add progress update if provided
    if (progress) {
      (result as Record<string, unknown>).progress = {
        ...((state as Record<string, unknown>).progress as ProgressInfo | undefined),
        ...progress,
      };
    }

    const memoryAfter = estimateStateSize({ ...state, ...result });
    const freed = memoryBefore - memoryAfter;
    console.log(`[${agentName}] Total memory freed: ${formatBytes(freed)}`);
    console.log(`[${agentName}] Estimated memory after: ${formatBytes(memoryAfter)}`);
    console.log(`[${agentName}] ======================================`);

    return result;
  };
}

/**
 * Creates a partial state object with specified keys cleared.
 *
 * Use this inline in existing nodes instead of creating separate cleanup nodes.
 *
 * @param keysToClear - State keys to clear
 * @returns A partial state object with cleared keys
 *
 * @example
 * ```typescript
 * async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
 *   // ... collapse logic ...
 *
 *   return {
 *     ...state,
 *     collapsedOutputs: collapsed,
 *     status: 'reducing',
 *     // Clear mapOutputs to free memory
 *     ...clearStateKeys<OverallStateType>(['mapOutputs']),
 *   };
 * }
 * ```
 */
export function clearStateKeys<TState extends Record<string, unknown>>(
  keysToClear: (keyof TState & string)[]
): Partial<TState> {
  const result: Partial<TState> = {};

  for (const key of keysToClear) {
    // mapOutputs uses mapOutputsMergeReducer: only `null` clears; [] would concat to no-op
    (result as Record<string, unknown>)[key] = key === "mapOutputs" ? null : [];
  }

  return result;
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Estimates the size of a state object in bytes.
 * Uses a rough estimation: strings length * 2 (UTF-16) + object overhead.
 */
function estimateStateSize(state: Record<string, unknown>): number {
  let size = 0;

  for (const value of Object.values(state)) {
    size += estimateValueSize(value);
  }

  return size;
}

/**
 * Estimates the size of a single value in bytes.
 */
function estimateValueSize(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "string") {
    // UTF-16 uses 2 bytes per character
    return value.length * 2;
  }

  if (typeof value === "number") {
    return 8;
  }

  if (typeof value === "boolean") {
    return 1;
  }

  if (Array.isArray(value)) {
    let size = 0;
    for (const item of value) {
      size += estimateValueSize(item);
    }
    return size;
  }

  if (typeof value === "object") {
    let size = 0;
    for (const v of Object.values(value as Record<string, unknown>)) {
      size += estimateValueSize(v);
    }
    return size;
  }

  return 0;
}

/**
 * Formats bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

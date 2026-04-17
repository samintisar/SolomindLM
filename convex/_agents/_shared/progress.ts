"use node";
/**
 * Progress tracking utilities for LLM agent operations.
 *
 * Provides standardized progress tracking across all agents with support
 * for streaming progress updates to clients via database updates.
 *
 * @example
 * ```typescript
 * import { createProgressTracker, ProgressCallback } from './progress.js';
 *
 * const tracker = createProgressTracker({
 *   onProgress: async (progress) => {
 *     await updateDatabase(progress);
 *   },
 *   totalChunks: 10,
 * });
 *
 * // Update progress
 * await tracker.update('map_process', 30, 'Processing chunk 3');
 * ```
 */

// ============================================================
// TYPES
// ============================================================

/**
 * Standardized progress information for all agents.
 */
export interface ProgressInfo {
  phase: string;
  percentage: number;
  message: string;
  chunksCompleted?: number;
  totalChunks?: number;
  itemsGenerated?: number;
  totalItems?: number;
}

/**
 * Progress callback type for streaming updates.
 */
export type ProgressCallback = (progress: ProgressInfo) => void | Promise<void>;

/**
 * Progress tracker configuration.
 */
export interface ProgressTrackerConfig {
  /** Callback to invoke when progress updates */
  onProgress?: ProgressCallback;
  /** Total number of chunks to process */
  totalChunks?: number;
  /** Total number of items to generate */
  totalItems?: number;
  /** Agent name for logging */
  agentName?: string;
}

// ============================================================
// PROGRESS TRACKER
// ============================================================

/**
 * Creates a progress tracker for an agent execution.
 *
 * @param config - Progress tracker configuration
 * @returns A progress tracker object
 *
 * @example
 * ```typescript
 * const tracker = createProgressTracker({
 *   onProgress: async (p) => console.log(p),
 *   totalChunks: 5,
 * });
 *
 * await tracker.updatePhase('map_process', 30, 'Processing...');
 * ```
 */
export function createProgressTracker(config: ProgressTrackerConfig = {}): ProgressTracker {
  return new ProgressTracker(config);
}

/**
 * Progress tracker class for managing and broadcasting progress updates.
 */
export class ProgressTracker {
  private onProgress?: ProgressCallback;
  private totalChunks?: number;
  private totalItems?: number;
  private agentName?: string;
  private currentPhase: string = "initializing";
  private currentPercentage: number = 0;
  private chunksCompleted: number = 0;
  private itemsGenerated: number = 0;

  constructor(config: ProgressTrackerConfig) {
    this.onProgress = config.onProgress;
    this.totalChunks = config.totalChunks;
    this.totalItems = config.totalItems;
    this.agentName = config.agentName || "Agent";
  }

  /**
   * Update progress with new information.
   *
   * @param phase - Current phase name
   * @param percentage - Progress percentage (0-100)
   * @param message - Progress message
   * @param additionalInfo - Optional additional progress information
   */
  async update(
    phase: string,
    percentage: number,
    message: string,
    additionalInfo?: Partial<ProgressInfo>
  ): Promise<void> {
    this.currentPhase = phase;
    this.currentPercentage = Math.min(100, Math.max(0, percentage));

    const progressInfo: ProgressInfo = {
      phase: this.currentPhase,
      percentage: this.currentPercentage,
      message,
      chunksCompleted: this.chunksCompleted,
      totalChunks: this.totalChunks,
      itemsGenerated: this.itemsGenerated,
      totalItems: this.totalItems,
      ...additionalInfo,
    };

    if (this.onProgress) {
      try {
        await this.onProgress(progressInfo);
      } catch (error) {
        console.error(`[${this.agentName}] Progress callback error:`, error);
      }
    }
  }

  /**
   * Update phase-specific progress (calculates percentage automatically).
   *
   * @param phase - Current phase name
   * @param phaseStart - Starting percentage for this phase
   * @param phaseEnd - Ending percentage for this phase
   * @param completed - Number of completed items in this phase
   * @param total - Total number of items in this phase
   * @param message - Progress message template (use {completed} and {total} placeholders)
   */
  async updatePhase(
    phase: string,
    phaseStart: number,
    phaseEnd: number,
    completed: number,
    total: number,
    message: string
  ): Promise<void> {
    const phaseProgress = total > 0 ? (completed / total) * (phaseEnd - phaseStart) : 0;
    const percentage = phaseStart + phaseProgress;
    const formattedMessage = message
      .replace("{completed}", String(completed))
      .replace("{total}", String(total));

    await this.update(phase, percentage, formattedMessage);
  }

  /**
   * Update chunks completed count.
   */
  setChunksCompleted(count: number): void {
    this.chunksCompleted = count;
  }

  /**
   * Update items generated count.
   */
  setItemsGenerated(count: number): void {
    this.itemsGenerated = count;
  }

  /**
   * Get current progress info.
   */
  getProgress(): ProgressInfo {
    return {
      phase: this.currentPhase,
      percentage: this.currentPercentage,
      message: "",
      chunksCompleted: this.chunksCompleted,
      totalChunks: this.totalChunks,
      itemsGenerated: this.itemsGenerated,
      totalItems: this.totalItems,
    };
  }
}

// ============================================================
// PROGRESS CONSTANTS
// ============================================================

/**
 * Standard progress phase ranges for all agents.
 * Ensures consistent progress reporting across different agent types.
 */
export const PROGRESS_PHASES = {
  SPLIT_CHUNKS: { start: 0, end: 5 },
  MAP: { start: 5, end: 60 },
  COLLAPSE: { start: 60, end: 70 },
  REDUCE: { start: 70, end: 100 },
} as const;

/**
 * Standard phase names for all agents.
 */
export const PHASE_NAMES = {
  INITIALIZING: "initializing",
  SPLIT_CHUNKS: "split_chunks",
  MAP: "mapping",
  COLLAPSE: "collapsing",
  REDUCE: "reducing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

// ============================================================
// PROGRESS HELPERS
// ============================================================

/**
 * Calculate progress percentage for a phase.
 *
 * @param phase - Phase name
 * @param completed - Completed items
 * @param total - Total items
 * @returns Progress percentage
 */
export function calculateProgress(
  phase: keyof typeof PROGRESS_PHASES,
  completed: number,
  total: number
): number {
  const range = PROGRESS_PHASES[phase];
  const phaseProgress = total > 0 ? (completed / total) * (range.end - range.start) : 0;
  return range.start + phaseProgress;
}

/**
 * Create a state update with progress information.
 *
 * @param state - Current state
 * @param progress - Progress info
 * @returns Partial state with progress
 */
export function createStateWithProgress<T extends { progress?: ProgressInfo }>(
  state: T,
  progress: Partial<ProgressInfo>
): Partial<T> {
  return {
    ...state,
    progress: {
      ...state.progress,
      ...progress,
    },
  } as Partial<T>;
}

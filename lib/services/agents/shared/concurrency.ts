"use node"
/**
 * Concurrency control utilities for agent operations.
 *
 * Prevents rate limit errors by capping parallel API calls.
 * Uses p-limit to provide bounded concurrency for Promise.all-like operations.
 */

import pLimit, { type LimitFunction } from 'p-limit';

// ============================================================
// TYPES
// ============================================================

/**
 * Async task function wrapper.
 */
export type AsyncTask<T> = () => Promise<T>;

// ============================================================
// LIMITER CACHE
// ============================================================

/**
 * Cache of limiters keyed by concurrency level.
 * Reuses limiters for the same concurrency level to avoid overhead.
 */
const limiters = new Map<number, LimitFunction>();

/**
 * Get or create a concurrency limiter for a specific concurrency level.
 *
 * @param concurrency - Maximum number of concurrent operations
 * @returns A p-limit limiter instance
 *
 * @example
 * ```typescript
 * const limiter = getConcurrencyLimiter(5);
 * const result = await limiter(() => someAsyncOperation());
 * ```
 */
export function getConcurrencyLimiter(concurrency: number): LimitFunction {
  if (!limiters.has(concurrency)) {
    limiters.set(concurrency, pLimit(concurrency));
  }
  return limiters.get(concurrency)!;
}

/**
 * Execute multiple async tasks with bounded concurrency.
 *
 * Similar to Promise.all(), but limits the number of concurrent operations.
 * Tasks are provided as functions (thunks) to defer execution until the limiter is ready.
 *
 * @param tasks - Array of async task functions
 * @param concurrency - Maximum number of tasks to run concurrently
 * @returns Promise that resolves with all task results in order
 *
 * @example
 * ```typescript
 * const results = await allWithConcurrency(
 *   [() => fetch(url1), () => fetch(url2), () => fetch(url3)],
 *   2 // Only 2 fetch operations at a time
 * );
 * ```
 */
export async function allWithConcurrency<T>(
  tasks: AsyncTask<T>[],
  concurrency: number
): Promise<T[]> {
  const limiter = getConcurrencyLimiter(concurrency);
  return Promise.all(tasks.map(task => limiter(task)));
}

/**
 * Execute async tasks with bounded concurrency and access to active/pending counts.
 *
 * Provides visibility into the limiter state for debugging and monitoring.
 *
 * @param tasks - Array of async task functions
 * @param concurrency - Maximum number of tasks to run concurrently
 * @returns Promise that resolves with all task results in order
 *
 * @example
 * ```typescript
 * const limiter = getConcurrencyLimiter(5);
 * console.log(limiter.activeCount); // Currently running tasks
 * console.log(limiter.pendingCount); // Queued tasks waiting to run
 * ```
 */
export { getConcurrencyLimiter as createLimiter };

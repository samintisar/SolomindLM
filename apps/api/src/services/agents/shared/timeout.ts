/**
 * Timeout utility for LLM agent operations.
 *
 * Provides robust timeout handling with proper cleanup to prevent
 * orphaned promises and memory leaks.
 */

/**
 * Wraps an async operation with a timeout guarantee.
 *
 * @param invokeFn - The async function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param phase - Operation phase name for error messages
 * @returns Promise that resolves with the result or rejects on timeout
 *
 * @example
 * ```typescript
 * const response = await invokeWithTimeout(
 *   () => llm.invoke(messages),
 *   30000,
 *   'map_phase'
 * );
 * ```
 */
export function invokeWithTimeout<T>(
  invokeFn: () => Promise<T>,
  timeoutMs: number,
  phase: string
): Promise<T> {
  let timeoutId!: Timer;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${phase} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  // Race between the actual operation and the timeout
  return Promise.race([invokeFn(), timeoutPromise])
    .finally(() => {
      // Always clear the timeout to prevent memory leaks
      clearTimeout(timeoutId);
    });
}

/**
 * Creates a timeout wrapper with a fixed timeout duration.
 * Useful for creating reusable timeout functions.
 *
 * @param timeoutMs - Fixed timeout in milliseconds
 * @returns A function that wraps any async operation with the fixed timeout
 *
 * @example
 * ```typescript
 * const with30sTimeout = createTimeoutWrapper(30000);
 * const response = await with30sTimeout(() => llm.invoke(messages), 'map_phase');
 * ```
 */
export function createTimeoutWrapper(
  timeoutMs: number
): (<T>(invokeFn: () => Promise<T>, phase: string) => Promise<T>) {
  return <T>(invokeFn: () => Promise<T>, phase: string): Promise<T> => {
    return invokeWithTimeout(invokeFn, timeoutMs, phase);
  };
}

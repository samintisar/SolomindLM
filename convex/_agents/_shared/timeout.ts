"use node";
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
  let timeoutId!: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${phase} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  // Race between the actual operation and the timeout
  return Promise.race([invokeFn(), timeoutPromise]).finally(() => {
    // Always clear the timeout to prevent memory leaks
    clearTimeout(timeoutId);
  });
}

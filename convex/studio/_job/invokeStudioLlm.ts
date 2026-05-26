"use node";

/**
 * Single entrypoint for Studio map/reduce (and similar) LLM calls.
 *
 * Defaults (keep in sync across all studio jobs):
 * - **Retry:** `maxAttempts: 3`, `baseDelayMs: 1000`, exponential backoff via `invokeWithRetry`
 * - **Timeout:** caller-provided `timeoutMs` per phase (no global default — each job uses CONFIG.*)
 */

import { invokeWithRetry, invokeWithTimeout, type RetryConfig } from "../../_agents/_shared/index";

/** Documented defaults for Studio LLM retries (exponential backoff inside invokeWithRetry). */
export const STUDIO_LLM_DEFAULT_RETRY: Pick<RetryConfig, "maxAttempts" | "baseDelayMs"> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
};

export type InvokeStudioLlmOptions<T> = {
  /** Full LLM invocation. */
  invoke: () => Promise<T>;
  timeoutMs: number;
  /** Used for timeout errors and as the `phase` string passed to invokeWithRetry. */
  phaseLabel: string;
  /** Optional retry overrides (defaults: STUDIO_LLM_DEFAULT_RETRY). */
  retry?: Partial<RetryConfig>;
  /**
   * Called before each retry (after the first failure). Receives 1-based attempt index
   * matching existing job logs (`attempt/3`).
   */
  onRetry?: (attempt: number, error: Error) => void;
};

export async function invokeStudioLlm<T>(options: InvokeStudioLlmOptions<T>): Promise<T> {
  const { invoke, timeoutMs, phaseLabel, retry, onRetry } = options;
  const nestedOnRetry = retry?.onRetry;

  const retryConfig: RetryConfig = {
    ...STUDIO_LLM_DEFAULT_RETRY,
    ...retry,
    ...(onRetry || nestedOnRetry
      ? {
          onRetry: (attempt, error, delayMs) => {
            if (onRetry) onRetry(attempt, error);
            nestedOnRetry?.(attempt, error, delayMs);
          },
        }
      : {}),
  };

  return invokeWithRetry(
    () => invokeWithTimeout(invoke, timeoutMs, phaseLabel),
    retryConfig,
    phaseLabel
  );
}

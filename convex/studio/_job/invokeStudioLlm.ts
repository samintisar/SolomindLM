"use node";

/**
 * Single entrypoint for Studio map/reduce (and similar) LLM calls.
 *
 * Defaults (keep in sync across all studio jobs):
 * - **Retry:** `maxAttempts: 3`, `baseDelayMs: 1000`, exponential backoff via `invokeWithRetry`
 * - **Timeout:** caller-provided `timeoutMs` per phase (no global default — each job uses CONFIG.*)
 */

import { invokeWithRetry, invokeWithTimeout, type RetryConfig } from "../../_agents/_shared/index";
import { createJobDeadline } from "./jobDeadline";

/** Documented defaults for Studio LLM retries (exponential backoff inside invokeWithRetry). */
const STUDIO_LLM_DEFAULT_RETRY: Pick<RetryConfig, "maxAttempts" | "baseDelayMs"> = {
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

/**
 * Runs a studio LLM call with `timeoutMs` bounding all retry attempts together,
 * not just each attempt, so a flaky provider cannot push past the job deadline.
 *
 * Each attempt only gets what is left of the shared budget, and no attempt starts
 * once it is spent (the timeout error is non-retryable), so the retry loop ends
 * with the budget instead of carrying on in the background.
 */
export function invokeWithinBudget<T>(options: InvokeStudioLlmOptions<T>): Promise<T> {
  const budget = createJobDeadline(options.timeoutMs);
  return invokeStudioLlm({
    ...options,
    invoke: () => {
      const remainingMs = budget.remainingMs();
      if (remainingMs <= 0) {
        return Promise.reject(
          new Error(`${options.phaseLabel} timeout after ${options.timeoutMs}ms`)
        );
      }
      return invokeWithTimeout(options.invoke, remainingMs, options.phaseLabel);
    },
  });
}

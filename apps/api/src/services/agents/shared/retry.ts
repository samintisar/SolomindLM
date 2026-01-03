/**
 * Retry utility for LLM agent operations.
 *
 * Provides exponential backoff retry logic with smart error detection
 * to avoid retrying non-retryable errors (validation, timeout, auth, etc.).
 */

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in milliseconds before first retry (default: 1000) */
  baseDelayMs?: number;
  /** Optional custom function to determine if an error is retryable */
  retryableErrors?: (error: Error) => boolean;
  /** Optional callback called before each retry attempt */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  /** Optional jitter to prevent thundering herd (default: false) */
  jitter?: boolean;
}

/**
 * Default error detection function.
 * Returns true for errors that should be retried (rate limits, server errors, network issues).
 * Returns false for errors that should not be retried (validation, timeout, auth).
 */
function isRetryableError(error: Error): boolean {
  const msg = error.message.toLowerCase();

  // Don't retry: validation, timeout, auth errors
  const nonRetryablePatterns = [
    'invalid',
    'validation',
    'timeout',
    'unauthorized',
    'forbidden',
    'not found',
    'authentication',
    'permission',
  ];

  for (const pattern of nonRetryablePatterns) {
    if (msg.includes(pattern)) {
      return false;
    }
  }

  // Retry: rate limits, server errors (500, 502, 503, 504), network issues
  const retryablePatterns = [
    'rate limit',
    'too many requests',
    '429',
    '500',
    '502',
    '503',
    '504',
    'network',
    'econnreset',
    'etimedout',
    'enotfound',
    'econnrefused',
    'temporary',
    'service unavailable',
  ];

  for (const pattern of retryablePatterns) {
    if (msg.includes(pattern)) {
      return true;
    }
  }

  // Default: don't retry unknown errors
  return false;
}

/**
 * Calculates delay with optional jitter for exponential backoff.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param jitter - Whether to add random jitter
 * @returns Delay in milliseconds
 */
function calculateDelay(attempt: number, baseDelayMs: number, jitter: boolean): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

  if (jitter) {
    // Add random jitter: +/- 25% of the delay
    const jitterAmount = exponentialDelay * 0.25;
    const randomJitter = (Math.random() - 0.5) * 2 * jitterAmount;
    return Math.max(0, Math.floor(exponentialDelay + randomJitter));
  }

  return exponentialDelay;
}

/**
 * Wraps an async operation with retry logic and exponential backoff.
 *
 * @param fn - The async function to execute with retry
 * @param config - Retry configuration options
 * @param phase - Operation phase name for error messages
 * @returns Promise that resolves with the result or rejects after all attempts exhausted
 *
 * @example
 * ```typescript
 * const response = await invokeWithRetry(
 *   () => llm.invoke(messages),
 *   {
 *     maxAttempts: 3,
 *     baseDelayMs: 1000,
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry ${attempt + 1}/${maxAttempts} after ${delay}ms`);
 *     }
 *   },
 *   'map_phase'
 * );
 * ```
 */
export async function invokeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  phase: string
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    retryableErrors = isRetryableError,
    onRetry,
    jitter = false,
  } = config;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      if (!retryableErrors(lastError)) {
        throw lastError;
      }

      // Don't retry after the last attempt
      if (attempt >= maxAttempts - 1) {
        break;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, baseDelayMs, jitter);

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, lastError, delay);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error(`${phase} failed after ${maxAttempts} attempts`);
}

/**
 * Creates a retry wrapper with fixed retry configuration.
 * Useful for creating reusable retry functions.
 *
 * @param config - Fixed retry configuration
 * @returns A function that wraps any async operation with the fixed retry behavior
 *
 * @example
 * ```typescript
 * const withRetry3 = createRetryWrapper({ maxAttempts: 3, baseDelayMs: 1000 });
 * const response = await withRetry3(() => llm.invoke(messages), 'map_phase');
 * ```
 */
export function createRetryWrapper(
  config: RetryConfig
): (<T>(fn: () => Promise<T>, phase: string) => Promise<T>) {
  return <T>(fn: () => Promise<T>, phase: string): Promise<T> => {
    return invokeWithRetry(fn, config, phase);
  };
}

/**
 * Predefined retry policies for common scenarios.
 */
export const RetryPolicies = {
  /**
   * Standard exponential backoff (no jitter)
   */
  exponential: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    jitter: false,
  } as RetryConfig,

  /**
   * Exponential backoff with jitter to prevent thundering herd
   */
  jitter: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    jitter: true,
  } as RetryConfig,

  /**
   * Aggressive retry for transient network issues
   */
  aggressive: {
    maxAttempts: 5,
    baseDelayMs: 500,
    jitter: true,
  } as RetryConfig,

  /**
   * Conservative retry for critical operations
   */
  conservative: {
    maxAttempts: 2,
    baseDelayMs: 2000,
    jitter: false,
  } as RetryConfig,
} as const;

"use node";

import { PROCESSING_CONFIG } from "./config.js";

const LOG_PREFIX = "[ReportGraph]";

export async function invokeWithTimeout<T>(
  invokeFn: () => Promise<T>,
  timeoutMs: number,
  phase: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const startTime = Date.now();

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const timeoutError = new Error(`${phase} timeout after ${timeoutMs}ms`);
      (timeoutError as any).phase = phase;
      (timeoutError as any).isTimeout = true;
      (timeoutError as any).timeoutMs = timeoutMs;
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([invokeFn(), timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;
    console.log(`${LOG_PREFIX} ${phase} completed in ${elapsed}ms`);
    return result;
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;

    if (error instanceof Error && error.message.includes("timeout")) {
      const enhancedError = new Error(`${phase} phase exceeded timeout of ${timeoutMs}ms`);
      (enhancedError as any).phase = phase;
      (enhancedError as any).isTimeout = true;
      (enhancedError as any).timeoutMs = timeoutMs;
      (enhancedError as any).elapsedTime = elapsed;
      (enhancedError as any).originalError = error;

      console.error(`${LOG_PREFIX} ${phase} TIMEOUT after ${elapsed}ms (limit: ${timeoutMs}ms)`);
      console.error(`${LOG_PREFIX} Error context:`, {
        phase,
        timeoutMs,
        elapsed,
        timestamp: new Date().toISOString(),
      });

      throw enhancedError;
    }

    console.error(
      `${LOG_PREFIX} ${phase} error after ${elapsed}ms:`,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

export async function invokeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
  phase: string
): Promise<T> {
  let lastError: Error | undefined;
  const startTime = Date.now();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (
        error instanceof Error &&
        (error.message.includes("Invalid") ||
          error.message.includes("validation") ||
          (error as any).isTimeout === true ||
          error.message.includes("timeout"))
      ) {
        (error as any).phase = phase;
        (error as any).attempt = attempt + 1;
        (error as any).maxRetries = maxRetries;
        throw error;
      }

      const elapsed = Date.now() - startTime;
      console.warn(
        `${LOG_PREFIX} ${phase} attempt ${attempt + 1}/${maxRetries} failed after ${elapsed}ms:`,
        error instanceof Error ? error.message : String(error)
      );

      if (attempt < maxRetries - 1) {
        const backoff = PROCESSING_CONFIG.RETRY_BACKOFF_MS * Math.pow(2, attempt);
        console.log(`${LOG_PREFIX} Retrying ${phase} in ${backoff}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  const elapsed = Date.now() - startTime;
  const finalError = lastError || new Error(`${phase} failed after ${maxRetries} attempts`);
  (finalError as any).phase = phase;
  (finalError as any).totalAttempts = maxRetries;
  (finalError as any).totalElapsedTime = elapsed;

  console.error(`${LOG_PREFIX} ${phase} failed after ${maxRetries} attempts and ${elapsed}ms`);
  throw finalError;
}

export function getMessageContent(response: unknown): string {
  if (typeof response === "object" && response !== null) {
    const msg = response as { content?: unknown };
    if (typeof msg.content === "string") {
      return msg.content;
    }
    if (typeof msg.content === "object" && msg.content !== null) {
      if (typeof (msg.content as { toString?: () => string }).toString === "function") {
        return (msg.content as { toString: () => string }).toString();
      }
    }
  }
  return String(response);
}

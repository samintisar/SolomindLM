"use node";

/**
 * Provider-specific request queue to prevent rate limiting.
 * 
 * Enforces minimum delays between requests to the same provider,
 * serializing concurrent calls to avoid burst traffic.
 */
export class ProviderRequestQueue {
  private lastRequestTime = 0;
  private minDelayMs: number;
  private pendingPromise: Promise<unknown> = Promise.resolve();

  constructor(minDelayMs: number) {
    this.minDelayMs = minDelayMs;
  }

  /**
   * Enqueue an async operation, ensuring minimum spacing from previous requests.
   * All requests to the same provider are serialized through this queue.
   */
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    // Chain behind any existing pending request
    const execute = async (): Promise<T> => {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      const waitTime = Math.max(0, this.minDelayMs - elapsed);

      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      this.lastRequestTime = Date.now();
      return fn();
    };

    // Serialize: wait for previous request to complete before starting next
    const result = this.pendingPromise.then(execute);
    this.pendingPromise = result.catch(() => undefined);
    return result;
  }

  /**
   * Reset the queue state. Useful for tests to avoid delays between test cases.
   */
  reset(): void {
    this.lastRequestTime = 0;
    this.pendingPromise = Promise.resolve();
  }

  /**
   * Temporarily override the minimum delay. Useful for tests.
   */
  setDelay(ms: number): void {
    this.minDelayMs = ms;
  }
}

/**
 * Shared queues for academic search providers.
 * 
 * Delays based on provider documentation:
 * - arXiv: 3000ms (official recommendation: "wait 3 seconds between API calls")
 * - Semantic Scholar: 5000ms (no API key = very strict rate limiting, observed 429s even at 1s)
 * - PubMed: 500ms (most lenient, no documented strict limit)
 */
export const arxivQueue = new ProviderRequestQueue(3000);
export const semanticScholarQueue = new ProviderRequestQueue(5000);
export const pubmedQueue = new ProviderRequestQueue(500);

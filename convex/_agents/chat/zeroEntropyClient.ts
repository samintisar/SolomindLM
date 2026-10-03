/** Per-request timeout for ZeroEntropy calls. Reranking is an optional quality step, so fail fast. */
export const ZEROENTROPY_TIMEOUT_MS = 8_000;

/**
 * ZeroEntropy client for reranking. SDK retries are off: during an outage the API
 * answers 503 with `Retry-After: 86400`, and the SDK sleeps for whatever Retry-After
 * says, so a single retry could block the caller for a day. Callers that want
 * retries use their own loop with capped backoff.
 */
export async function createZeroEntropyClient(apiKey: string, options: { baseURL?: string } = {}) {
  const { ZeroEntropy } = await import("zeroentropy");
  return new ZeroEntropy({ apiKey, maxRetries: 0, timeout: ZEROENTROPY_TIMEOUT_MS, ...options });
}

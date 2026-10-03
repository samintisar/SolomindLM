/**
 * Voyage AI reranker used for chat/search retrieval and literature-review ranking.
 * @see convex/_services/ai/voyageRerank.ts
 */
export const RERANK_MODEL = "rerank-3" as const;

/**
 * Hard ceiling on one rerank round-trip. Reranking only refines retrieval order, so a slow
 * or down provider must fail fast and let callers fall back to the un-reranked order. The
 * previous provider's SDK waited out a `Retry-After: 86400` during its multi-day outage,
 * which turned a degraded reranker into a chat reply that never came.
 */
export const RERANK_TIMEOUT_MS = 8000;

/**
 * Backstop in `cachedRerank` for a stalled action. Outlasts the fetch abort so the
 * client's own timeout error surfaces first when the provider is merely slow.
 */
export const RERANK_ACTION_BACKSTOP_MS = RERANK_TIMEOUT_MS + 1000;

/**
 * Outer budget `ChatAgent` gives any global rerank function, past which chat keeps the
 * merged hybrid order. Outlasts the backstop so it only fires for a custom rerank function.
 */
export const GLOBAL_RERANK_TIMEOUT_MS = RERANK_ACTION_BACKSTOP_MS + 1000;

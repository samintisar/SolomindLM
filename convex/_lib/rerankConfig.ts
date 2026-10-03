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

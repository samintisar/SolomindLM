/**
 * OpenAI embedding model used across ingestion, chat/search retrieval, and RAG.
 * @see convex/_services/ai/embeddingClient.ts
 */
export const EMBEDDING_MODEL = "text-embedding-3-small" as const;

/**
 * Requested explicitly on every API call (not left as OpenAI's implicit
 * default) so a future provider-side default change can't silently resize
 * vectors out from under the `documentChunks.by_embedding` index.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * RAG chunk sizing, carried over unchanged from the prior Together E5
 * migration. Re-tuning chunk granularity to exploit OpenAI's larger context
 * window is a separate retrieval-quality decision, not part of this
 * deprecation-driven provider swap.
 */
export const RAG_CHUNK_SIZE_TOKENS = 220;
export const RAG_CHUNK_OVERLAP_TOKENS = 55;

/** Chunks per embeddings API call (array `input`). Fewer HTTP round-trips than one-per-chunk. */
export const EMBEDDING_BATCH_SIZE = 64;

"use node";

import { env } from "../../_lib/env.js";

export const WIKI_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt((env as any).WIKI_MAP_CHUNK_TOKENS || "8000", 10),
  REDUCE_CHUNK_SIZE_TOKENS: parseInt((env as any).WIKI_REDUCE_CHUNK_TOKENS || "16000", 10),
  MAP_TIMEOUT_MS: parseInt((env as any).WIKI_MAP_TIMEOUT_MS || "180000", 10),
  REDUCE_TIMEOUT_MS: parseInt((env as any).WIKI_REDUCE_TIMEOUT_MS || "240000", 10),
  REDUCE_MAX_TOKENS: parseInt((env as any).WIKI_REDUCE_MAX_TOKENS || "32000", 10),
  /** Characters of joined source text passed into each article prompt (avoids huge JSON / context). */
  MAX_RELEVANT_CONTENT_CHARS: parseInt((env as any).WIKI_MAX_RELEVANT_CONTENT_CHARS || "14000", 10),
  /** Concepts synthesized per Convex action to stay under the 600s action limit. */
  SYNTHESIZE_BATCH_SIZE: Math.max(1, parseInt((env as any).WIKI_SYNTHESIZE_BATCH_SIZE || "5", 10)),
  /** Parallel article LLM calls within one batch (1 = sequential). Higher = faster wall time; watch rate limits. */
  SYNTHESIZE_CONCURRENCY: Math.max(
    1,
    parseInt((env as any).WIKI_SYNTHESIZE_CONCURRENCY || "3", 10)
  ),
  /** Max concepts after collapse; 0 = unlimited (batches still apply). */
  MAX_WIKI_CONCEPTS: parseInt((env as any).WIKI_MAX_CONCEPTS || "0", 10),
  DEFAULT_CONCEPT_COUNT: 5,
  MAX_ARTICLES_PER_CONCEPT: 1,
  MAX_CONNECTIONS: 5,
} as const;

export const GRAPH_CONFIG = {
  ...WIKI_CONFIG,
} as const;

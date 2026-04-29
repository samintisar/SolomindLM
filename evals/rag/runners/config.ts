import type { RetrievalConfigSnapshot } from "../types";

/**
 * Snapshot the current retrieval config so every runner in a batch
 * uses the same baseline values.  The snapshot is then hashed into
 * `configHash` for metric aggregation and comparison across runs.
 *
 * Values are duplicated here (rather than imported from convex/) because:
 *   1. The eval harness runs outside the Convex action environment;
 *      the `"use node"` files in `convex/_agents/chat/` read env vars
 *      at module-load time which requires a Convex runtime.
 *   2. `DEFAULT_HYBRID_CONFIG` is a module-local const, not exported.
 *
 * Keep in sync with:
 *   - convex/_lib/env.ts                  (CHAT_* env defaults)
 *   - convex/_agents/chat/chatConfig.ts   (CONTEXT_TOKEN_BUDGET, etc.)
 *   - convex/_agents/chat/hybrid_search.ts (DEFAULT_HYBRID_CONFIG)
 */
export function snapshotRetrievalConfig(
  overrides?: Partial<RetrievalConfigSnapshot>
): RetrievalConfigSnapshot {
  const defaults: RetrievalConfigSnapshot = {
    // chatConfig.ts defaults (env fallbacks in convex/_lib/env.ts)
    contextTokenBudget: parseInt(process.env.CHAT_CONTEXT_TOKEN_BUDGET ?? "8000", 10),
    minRelevanceThreshold: parseFloat(process.env.CHAT_MIN_RELEVANCE_THRESHOLD ?? "0.20"),
    maxChunksHardLimit: parseInt(process.env.CHAT_MAX_CHUNKS_HARD_LIMIT ?? "50", 10),

    // Hybrid search defaults from convex/_lib/env.ts
    vectorMatchThreshold: parseFloat(process.env.CHAT_VECTOR_MATCH_THRESHOLD ?? "0.4"),
    vectorMatchCount: parseInt(process.env.CHAT_VECTOR_MATCH_COUNT ?? "25", 10),
    rerankThreshold: parseInt(process.env.CHAT_RERANK_THRESHOLD ?? "10", 10),
    rerankTopN: parseInt(process.env.CHAT_RERANK_TOP_N ?? "7", 10),
    maxResults: parseInt(process.env.CHAT_MAX_RESULTS ?? "7", 10),
    keywordMatchCount: parseInt(process.env.CHAT_KEYWORD_MATCH_COUNT ?? "50", 10),
    rrfK: parseInt(process.env.CHAT_RRF_K ?? "60", 10),
    enableHybrid: (process.env.CHAT_ENABLE_HYBRID_SEARCH ?? "true") === "true",
    hybridThreshold: parseFloat(process.env.CHAT_HYBRID_THRESHOLD ?? "0.012"),
  };

  return { ...defaults, ...overrides };
}

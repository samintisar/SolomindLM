import { env } from "../../../convex/_lib/env";
import type { RetrievalConfigSnapshot } from "../types";

/**
 * Snapshot the current retrieval config so every runner in a batch
 * uses the same baseline values.  The snapshot is then hashed into
 * `configHash` for metric aggregation and comparison across runs.
 *
 * Values come from the backend's own constants in convex/_lib/env.ts, parsed the same way
 * convex/chat/_streamSearch.ts and convex/_agents/chat/chatConfig.ts parse them, so the
 * hash tracks what the deployment runs. (The CHAT_* entries there are fixed strings, not
 * process.env reads, so local env vars cannot change them.)
 */
export function snapshotRetrievalConfig(
  overrides?: Partial<RetrievalConfigSnapshot>
): RetrievalConfigSnapshot {
  const defaults: RetrievalConfigSnapshot = {
    // Context selection (convex/_agents/chat/chatConfig.ts)
    contextTokenBudget: parseInt(env.CHAT_CONTEXT_TOKEN_BUDGET, 10),
    minRelevanceThreshold: parseFloat(env.CHAT_MIN_RELEVANCE_THRESHOLD),
    maxChunksHardLimit: parseInt(env.CHAT_MAX_CHUNKS_HARD_LIMIT, 10),

    // Hybrid search (convex/chat/_streamSearch.ts)
    vectorMatchThreshold: parseFloat(env.CHAT_VECTOR_MATCH_THRESHOLD),
    vectorMatchCount: parseInt(env.CHAT_VECTOR_MATCH_COUNT, 10),
    rerankThreshold: parseInt(env.CHAT_RERANK_THRESHOLD, 10),
    rerankTopN: parseInt(env.CHAT_RERANK_TOP_N, 10),
    maxResults: parseInt(env.CHAT_MAX_RESULTS, 10),
    keywordMatchCount: parseInt(env.CHAT_KEYWORD_MATCH_COUNT, 10),
    rrfK: parseInt(env.CHAT_RRF_K, 10),
    enableHybrid: env.CHAT_ENABLE_HYBRID_SEARCH !== "false",
    hybridThreshold: parseFloat(env.CHAT_HYBRID_THRESHOLD),
  };

  return { ...defaults, ...overrides };
}

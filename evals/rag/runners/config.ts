import { CHAT_PROMPT_VERSION } from "../../../convex/_agents/chat/chat_llm_prompts";
import {
  LIST_QUERY_CONTEXT_TOKEN_BUDGET,
  LIST_QUERY_MAX_SELECTED_CHUNKS,
  MAX_NEIGHBOUR_PASSAGES,
  MAX_OPENING_PASSAGES,
  MAX_PER_SOURCE_DOCUMENTS,
  MULTI_SOURCE_EXTRA_TOKENS_PER_DOCUMENT,
  MULTI_SOURCE_MAX_EXTRA_TOKENS,
  NEIGHBOUR_PASSAGE_TOKEN_BUDGET,
  OPENING_PASSAGE_TOKEN_BUDGET,
  PER_SOURCE_PASSAGES_PER_SEARCH,
} from "../../../convex/_agents/chat/chatConfig";
import { DEFAULT_SMART_MODEL_ID } from "../../../convex/_lib/defaultSmartModel";
import {
  RAG_CHUNK_OVERLAP_TOKENS,
  RAG_CHUNK_SIZE_TOKENS,
} from "../../../convex/_lib/embeddingConfig";
import { env } from "../../../convex/_lib/env";
import type { RetrievalConfigSnapshot } from "../types";

/**
 * Fast model default. convex/_lib/env.ts reads FAST_LLM from process.env with this value as the
 * fallback, and that env read is not the deployment's, so the default is repeated here.
 */
const DEFAULT_FAST_MODEL_ID = "Qwen/Qwen3.5-9B";

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

    // Context budgets beyond selection (convex/_agents/chat/chatConfig.ts)
    listQueryContextTokenBudget: LIST_QUERY_CONTEXT_TOKEN_BUDGET,
    listQueryMaxSelectedChunks: LIST_QUERY_MAX_SELECTED_CHUNKS,
    neighbourPassageTokenBudget: NEIGHBOUR_PASSAGE_TOKEN_BUDGET,
    maxNeighbourPassages: MAX_NEIGHBOUR_PASSAGES,
    openingPassageTokenBudget: OPENING_PASSAGE_TOKEN_BUDGET,
    maxOpeningPassages: MAX_OPENING_PASSAGES,
    multiSourceExtraTokensPerDocument: MULTI_SOURCE_EXTRA_TOKENS_PER_DOCUMENT,
    multiSourceMaxExtraTokens: MULTI_SOURCE_MAX_EXTRA_TOKENS,
    perSourcePassagesPerSearch: PER_SOURCE_PASSAGES_PER_SEARCH,
    maxPerSourceDocuments: MAX_PER_SOURCE_DOCUMENTS,

    // Indexing and models
    chunkSizeTokens: RAG_CHUNK_SIZE_TOKENS,
    chunkOverlapTokens: RAG_CHUNK_OVERLAP_TOKENS,
    smartModel: DEFAULT_SMART_MODEL_ID,
    fastModel: DEFAULT_FAST_MODEL_ID,
    promptVersion: CHAT_PROMPT_VERSION,
  };

  return { ...defaults, ...overrides };
}

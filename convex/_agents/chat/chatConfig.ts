"use node";

import { env } from "../../_lib/env";

/**
 * Available smart model IDs for RAG chat.
 * Used for validation on the backend. Keep in sync with AVAILABLE_SMART_MODELS in apps/web/src/shared/constants/models.ts
 */
export const AVAILABLE_SMART_MODEL_IDS = [
  "openai/gpt-oss-120b",
  "moonshotai/Kimi-K2.6",
  "deepseek-ai/DeepSeek-V4-Pro",
  "MiniMaxAI/MiniMax-M2.7",
  "google/gemma-4-31B-it",
  "Qwen/Qwen3.5-397B-A17B",
  "zai-org/GLM-5.1",
] as const;

export type SmartModelId = typeof AVAILABLE_SMART_MODEL_IDS[number];

/** HyDE + embed + hybrid search must finish before Convex action limits kill the stream (client saw only `searching` then disconnect). */
export const SEARCH_PIPELINE_TIMEOUT_MS = 70000;

export const FOLLOWUP_GENERATION_TIMEOUT_MS = 15000;

export const RESPONSE_GENERATION_TIMEOUT_MS = 180000;

/** Context selection configuration (token-based budgeting with relevance threshold) */
export const MIN_RELEVANCE_THRESHOLD = parseFloat(
  env.CHAT_MIN_RELEVANCE_THRESHOLD ?? "0.20"
);
export const CONTEXT_TOKEN_BUDGET = parseInt(env.CHAT_CONTEXT_TOKEN_BUDGET ?? "12000", 10);
export const MAX_CHUNKS_HARD_LIMIT = parseInt(env.CHAT_MAX_CHUNKS_HARD_LIMIT ?? "50", 10);

/**
 * List queries retrieve a wide candidate pool upstream; context packing stays
 * stricter so the model sees mostly on-topic passages (better precision@K + answers).
 */
export const LIST_QUERY_RELEVANCE_THRESHOLD = MIN_RELEVANCE_THRESHOLD;

/** Max chunks passed to the LLM for list/enumeration questions after global rerank. */
export const LIST_QUERY_MAX_SELECTED_CHUNKS = 12;

/** Tighter context budget for lists — many short chunks were packing 30+ passages before the chunk cap. */
export const LIST_QUERY_CONTEXT_TOKEN_BUDGET = 5200;

/** Larger retrieval pool for subqueries to maximize coverage before reranking (reduced from 6 for better precision) */
export const SUBQUERY_POOL_MULTIPLIER = 5;

/** Smaller token yields so the HTTP stream and UI update more frequently than whole-paragraph chunks. */
export const STREAM_TOKEN_SLICE_CHARS = 480;
export const STREAM_TOKEN_DELAY_MS = 12;

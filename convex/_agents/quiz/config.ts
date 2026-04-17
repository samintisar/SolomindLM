"use node";

import { env } from "../../_lib/env.js";

/**
 * Safely parse integer env vars with fallback.
 */
const safeParseInt = (val: string | undefined, fallback: number): number => {
  const parsed = parseInt(val || "", 10);
  return isNaN(parsed) ? fallback : parsed;
};

const QUIZ_CONFIG = {
  // OPTIMIZED: Smaller chunks (2500 tokens) to prevent timeouts
  MAP_CHUNK_SIZE_TOKENS: safeParseInt(env.QUIZ_MAP_CHUNK_TOKENS, 2500),
  REDUCE_CHUNK_SIZE_TOKENS: safeParseInt(env.QUIZ_REDUCE_CHUNK_TOKENS, 10000),
  MIN_QUESTIONS_PER_CHUNK: safeParseInt(env.QUIZ_MIN_QUESTIONS_PER_CHUNK, 2),
  MAX_QUESTIONS_PER_CHUNK: safeParseInt(env.QUIZ_MAX_QUESTIONS_PER_CHUNK, 20),
  MIN_CHUNKS: safeParseInt(env.QUIZ_MIN_CHUNKS, 2),
  MAP_MAX_TOKENS: safeParseInt(env.QUIZ_MAX_TOKENS, 8000),
  MAP_TIMEOUT_MS: safeParseInt(env.QUIZ_MAP_TIMEOUT_MS, 180000),
  REDUCE_TIMEOUT_MS: safeParseInt(env.QUIZ_REDUCE_TIMEOUT_MS, 240000),
  REDUCE_MAX_TOKENS: safeParseInt(env.QUIZ_REDUCE_MAX_TOKENS, 24000),
  EXPAND_MAX_TOKENS: safeParseInt(env.QUIZ_EXPAND_MAX_TOKENS, 4096),
  EXPAND_CONCURRENCY: safeParseInt(env.QUIZ_EXPAND_CONCURRENCY, 5),
  MAX_COLLAPSE_DEPTH: 5,
} as const;

export const GRAPH_CONFIG = {
  ...QUIZ_CONFIG,
} as const;

"use node";

/** Configuration constants for AudioOverviewGraph */
export const GRAPH_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 20_000,
  REDUCE_CHUNK_SIZE_TOKENS: 40_000,
  MAP_TIMEOUT_MS: 300_000, // 5 minutes
  REDUCE_TIMEOUT_MS: 600_000, // 10 minutes
  TTS_TIMEOUT_MS: 300_000, // 5 minutes
  REDUCE_MAX_OUTPUT_TOKENS: 16_384,
} as const;

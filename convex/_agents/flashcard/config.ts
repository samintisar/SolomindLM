"use node";

export const FLASHCARD_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 5_000,
  REDUCE_CHUNK_SIZE_TOKENS: 10_000,
  MAP_TIMEOUT_MS: 180_000, // 3 minutes
  REDUCE_TIMEOUT_MS: 240_000, // 4 minutes
  REDUCE_MAX_TOKENS: 32_000,
} as const;

export const GRAPH_CONFIG = {
  ...FLASHCARD_CONFIG,
} as const;

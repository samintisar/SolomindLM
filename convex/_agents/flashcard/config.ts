"use node";

export const FLASHCARD_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 5_000,
  REDUCE_CHUNK_SIZE_TOKENS: 10_000,
  MAP_TIMEOUT_MS: 180_000, // 3 minutes
  REDUCE_TIMEOUT_MS: 240_000, // 4 minutes
  REDUCE_MAX_TOKENS: 32_000,
  COLLAPSE_CONCURRENCY: 5,
  REFINE_RESERVE_MS: 270_000, // held back from collapse rounds: up to 240s of refine + save
  MIN_COLLAPSE_CALL_MS: 60_000, // skip collapse calls below this per-call budget
  // Largest card set sent to the refine call; beyond this the prompt cannot fit
  // the model context alongside a 32k-token response.
  REFINE_MAX_INPUT_TOKENS: 60_000,
} as const;

export const GRAPH_CONFIG = {
  ...FLASHCARD_CONFIG,
} as const;

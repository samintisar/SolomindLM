"use node";

export const FLASHCARD_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: 5_000,
  REDUCE_CHUNK_SIZE_TOKENS: 10_000,
  MAP_TIMEOUT_MS: 180_000, // 3 minutes
  REDUCE_TIMEOUT_MS: 240_000, // 4 minutes
  REDUCE_MAX_TOKENS: 32_000,
  COLLAPSE_CONCURRENCY: 5,
  // Finalization must end (saved or marked failed) before Convex's 600s action
  // limit, which kills the action without running its catch block.
  FINALIZE_BUDGET_MS: 540_000,
  REFINE_RESERVE_MS: 270_000, // held back from collapse rounds: up to 240s of refine + save
  MIN_COLLAPSE_CALL_MS: 60_000, // skip collapse calls below this per-call budget
  SAVE_RESERVE_MS: 30_000, // held back from refine for title generation + saving
  TITLE_TIMEOUT_MS: 20_000,
} as const;

export const GRAPH_CONFIG = {
  ...FLASHCARD_CONFIG,
} as const;

"use node";

import { env } from "../../_lib/env.js";

export const FLASHCARD_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.FLASHCARD_MAP_CHUNK_TOKENS, 10),
  REDUCE_CHUNK_SIZE_TOKENS: parseInt(env.FLASHCARD_REDUCE_CHUNK_TOKENS, 10),
  MAP_TIMEOUT_MS: parseInt(env.FLASHCARD_MAP_TIMEOUT_MS, 10),
  REDUCE_TIMEOUT_MS: parseInt(env.FLASHCARD_REDUCE_TIMEOUT_MS, 10),
  REDUCE_MAX_TOKENS: parseInt(env.FLASHCARD_REDUCE_MAX_TOKENS, 10),
} as const;

export const GRAPH_CONFIG = {
  ...FLASHCARD_CONFIG,
} as const;

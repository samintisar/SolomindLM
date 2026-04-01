"use node"

import { env } from '../../_lib/env.js';

export const FLASHCARD_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.FLASHCARD_MAP_CHUNK_TOKENS || '7500', 10),
  REDUCE_CHUNK_SIZE_TOKENS: parseInt(env.FLASHCARD_REDUCE_CHUNK_TOKENS || '15000', 10),
  MAP_TIMEOUT_MS: parseInt(env.FLASHCARD_MAP_TIMEOUT_MS || '180000', 10),
  REDUCE_TIMEOUT_MS: parseInt(env.FLASHCARD_REDUCE_TIMEOUT_MS || '240000', 10),
  REDUCE_MAX_TOKENS: parseInt(env.FLASHCARD_REDUCE_MAX_TOKENS || '32000', 10),
} as const;

export const GRAPH_CONFIG = {
  ...FLASHCARD_CONFIG,
} as const;

"use node";

import { env } from "../../_lib/env.js";

export const GRAPH_CONFIG = {
  OPTIMAL_CHUNK_SIZE_TOKENS: parseInt(env.MINDMAP_MAP_CHUNK_TOKENS, 10),
  REDUCE_CHUNK_SIZE_TOKENS: parseInt(env.MINDMAP_REDUCE_CHUNK_TOKENS, 10),
  MAX_CONCURRENT_CHUNKS: 10,
  MAP_TIMEOUT_MS: parseInt(env.MINDMAP_MAP_TIMEOUT_MS, 10),
  REDUCE_TIMEOUT_MS: parseInt(env.MINDMAP_REDUCE_TIMEOUT_MS, 10),
} as const;

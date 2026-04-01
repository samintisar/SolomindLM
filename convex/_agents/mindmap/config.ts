"use node"

import { env } from '../../_lib/env.js';

export const GRAPH_CONFIG = (() => {
  return {
    OPTIMAL_CHUNK_SIZE_TOKENS: parseInt(env.MINDMAP_MAP_CHUNK_TOKENS || '3750', 10), // ~15K chars ≈ 3.75K tokens
    REDUCE_CHUNK_SIZE_TOKENS: parseInt(env.MINDMAP_REDUCE_CHUNK_TOKENS || '7500', 10), // ~30K chars ≈ 7.5K tokens
    MAX_CONCURRENT_CHUNKS: 10,
    MAP_TIMEOUT_MS: parseInt(env.MINDMAP_MAP_TIMEOUT_MS || '300000', 10),
    REDUCE_TIMEOUT_MS: parseInt(env.MINDMAP_REDUCE_TIMEOUT_MS || '300000', 10),
  } as const;
})();

"use node";

import { createChunkHelpers, type ChunkHelpers } from "../_shared/chunk_helper_factory.js";

import { GRAPH_CONFIG } from "./config.js";

const { packChunks, validateChunks }: ChunkHelpers = createChunkHelpers("AudioOverviewGraph", {
  targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS,
  minChunkLength: 50,
  maxChunkLength: 50000,
});

export { packChunks, validateChunks };

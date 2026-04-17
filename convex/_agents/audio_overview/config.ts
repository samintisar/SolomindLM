"use node";

import { env } from "../../_lib/env";

/** Configuration constants for AudioOverviewGraph */
export const GRAPH_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.AUDIO_MAP_CHUNK_TOKENS || "3750", 10), // ~15K chars ≈ 3.75K tokens
  REDUCE_CHUNK_SIZE_TOKENS: parseInt(env.AUDIO_REDUCE_CHUNK_TOKENS || "10000", 10), // ~40K chars ≈ 10K tokens
  MAP_TIMEOUT_MS: parseInt(env.AUDIO_MAP_TIMEOUT_MS || "180000", 10),
  REDUCE_TIMEOUT_MS: parseInt(env.AUDIO_REDUCE_TIMEOUT_MS || "300000", 10),
  TTS_TIMEOUT_MS: parseInt(env.AUDIO_TTS_TIMEOUT_MS || "300000", 10),
} as const;

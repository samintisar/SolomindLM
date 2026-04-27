"use node";

import { env } from "../../_lib/env";

/** HyDE + embed + hybrid search must finish before Convex action limits kill the stream (client saw only `searching` then disconnect). */
export const SEARCH_PIPELINE_TIMEOUT_MS = parseInt(
  process.env.CHAT_SEARCH_PIPELINE_TIMEOUT_MS ?? "70000",
  10
);

export const FOLLOWUP_GENERATION_TIMEOUT_MS = parseInt(
  process.env.CHAT_FOLLOWUP_TIMEOUT_MS ?? "15000",
  10
);

export const RESPONSE_GENERATION_TIMEOUT_MS = parseInt(
  process.env.CHAT_RESPONSE_TIMEOUT_MS ?? "90000",
  10
);

/** Context selection configuration (token-based budgeting with relevance threshold) */
export const MIN_RELEVANCE_THRESHOLD = parseFloat(env.CHAT_MIN_RELEVANCE_THRESHOLD ?? "0.20");
export const CONTEXT_TOKEN_BUDGET = parseInt(env.CHAT_CONTEXT_TOKEN_BUDGET ?? "8000", 10);
export const MAX_CHUNKS_HARD_LIMIT = parseInt(env.CHAT_MAX_CHUNKS_HARD_LIMIT ?? "50", 10);

/** Smaller token yields so the HTTP stream and UI update more frequently than whole-paragraph chunks. */
export const STREAM_TOKEN_SLICE_CHARS = parseInt(
  process.env.CHAT_STREAM_TOKEN_SLICE_CHARS ?? "480",
  10
);
export const STREAM_TOKEN_DELAY_MS = parseInt(process.env.CHAT_STREAM_TOKEN_DELAY_MS ?? "12", 10);

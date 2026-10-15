"use node";

import { env } from "../../_lib/env";

/** HyDE + embed + hybrid search must finish before Convex action limits kill the stream (client saw only `searching` then disconnect). */
export const SEARCH_PIPELINE_TIMEOUT_MS = 70000;

/**
 * HyDE is optional: past this deadline a sub-query searches with its own text alone. Without it a
 * stalled Together call used the whole search budget and failed every sub-query.
 */
export const HYDE_TIMEOUT_MS = 8000;

/** One sub-query's embedding; past this its search fails instead of using the whole budget. */
export const EMBEDDING_TIMEOUT_MS = 15000;

/**
 * Each search-planner attempt (fast model, then smart model) runs before any source is searched;
 * past this deadline it falls back to searching the user's message. Eval runs take 1.1s at p50
 * and 2.4s at most.
 */
export const PLANNER_TIMEOUT_MS = 8000;

/** The smart-model planner retry: a slower model, with no eval timings yet (it never ran). */
export const PLANNER_FALLBACK_TIMEOUT_MS = 15000;

/** A reply without sources (greetings, app questions); past this it sends a fixed reply. */
export const DIRECT_RESPONSE_TIMEOUT_MS = 30000;

/** Also passed to the LLM call, so a stalled request is aborted rather than left running. */
export const FOLLOWUP_GENERATION_TIMEOUT_MS = 15000;
/** Global rerank is optional; past this budget chat keeps the merged hybrid order. */
export { GLOBAL_RERANK_TIMEOUT_MS } from "../../_lib/rerankConfig";

export const RESPONSE_GENERATION_TIMEOUT_MS = 180000;

/** Context selection configuration (token-based budgeting with relevance threshold) */
export const MIN_RELEVANCE_THRESHOLD = parseFloat(env.CHAT_MIN_RELEVANCE_THRESHOLD);
export const CONTEXT_TOKEN_BUDGET = parseInt(env.CHAT_CONTEXT_TOKEN_BUDGET, 10);
export const MAX_CHUNKS_HARD_LIMIT = parseInt(env.CHAT_MAX_CHUNKS_HARD_LIMIT, 10);

/** Passages each relevant source is guaranteed when a question draws on several sources. */
export const MIN_PASSAGES_PER_DOCUMENT = 2;

/** Extra context tokens per additional relevant source, so guaranteed shares do not eat the budget. */
export const MULTI_SOURCE_EXTRA_TOKENS_PER_DOCUMENT = 4000;

/** Cap on the extra tokens multi-source questions add (8000 base → at most 20000). */
export const MULTI_SOURCE_MAX_EXTRA_TOKENS = 12000;

/**
 * Most selected sources a per-source question ("what does each paper say about X?") searches one
 * by one; with more, retrieval stays notebook-wide and the answer covers what it finds.
 */
export const MAX_PER_SOURCE_DOCUMENTS = 10;

/**
 * Passages each per-source search adds to the rerank pool, per sub-query. At 4, a paper whose
 * limitations sit in a "Broader Impact" section never had them reach the rerank (#450); at 10
 * they did in every run. With three sources the pool stayed about the size of a notebook-wide
 * search's; it grows with each source, up to MAX_PER_SOURCE_DOCUMENTS × this per sub-query.
 */
export const PER_SOURCE_PASSAGES_PER_SEARCH = 10;

/**
 * Tokens for whole neighbouring passages added beside selected ones, so text the model would
 * only see as a neighbour preview can be cited (and a reader opening the citation sees it).
 */
export const NEIGHBOUR_PASSAGE_TOKEN_BUDGET = 2000;

/** Most neighbouring passages added to one answer's context. */
export const MAX_NEIGHBOUR_PASSAGES = 8;

/**
 * Tokens for the opening passages (title, start of the abstract) of documents the context draws
 * on, so the model knows what each source is and how a study was done (#477). About one passage
 * per source at MAX_OPENING_PASSAGES.
 */
export const OPENING_PASSAGE_TOKEN_BUDGET = 3000;

/** Most opening passages added to one answer's context: one per source. */
export const MAX_OPENING_PASSAGES = MAX_PER_SOURCE_DOCUMENTS;

/** Max chunks passed to the LLM for list/enumeration questions after global rerank. */
export const LIST_QUERY_MAX_SELECTED_CHUNKS = 24;

/** Tighter context budget for lists — many short chunks were packing 30+ passages before the chunk cap. */
export const LIST_QUERY_CONTEXT_TOKEN_BUDGET = 5200;

/** Max characters per attached document to prevent context overflow (~3000 tokens). */
export const ATTACHED_DOC_MAX_CHARS = 12000;

/** Larger retrieval pool for subqueries to maximize coverage before reranking (reduced from 6 for better precision) */
export const SUBQUERY_POOL_MULTIPLIER = 5;

/** Smaller token yields so the HTTP stream and UI update more frequently than whole-paragraph chunks. */
export const STREAM_TOKEN_SLICE_CHARS = 480;
export const STREAM_TOKEN_DELAY_MS = 12;

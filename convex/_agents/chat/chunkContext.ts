"use node";

import { countTokens } from "../_shared/tokenizer";
import type { ReferenceChunk } from "../../storage/ChatHistoryService";
import {
  CONTEXT_TOKEN_BUDGET,
  MAX_CHUNKS_HARD_LIMIT,
  MIN_RELEVANCE_THRESHOLD,
} from "./chatConfig.js";

export { LIST_QUERY_RELEVANCE_THRESHOLD } from "./chatConfig.js";

export function chunkDedupKey(c: ReferenceChunk): string {
  return `${c.sourceId}:${c.chunkIndex}`;
}

export function mergeChunkScores(existing: ReferenceChunk, incoming: ReferenceChunk): ReferenceChunk {
  const pickMax = (a?: number, b?: number): number | undefined => {
    const hasA = a != null && !Number.isNaN(a);
    const hasB = b != null && !Number.isNaN(b);
    if (!hasA && !hasB) return undefined;
    return Math.max(hasA ? (a as number) : 0, hasB ? (b as number) : 0);
  };
  return {
    ...existing,
    similarity: pickMax(existing.similarity, incoming.similarity),
    rrfScore: pickMax(existing.rrfScore, incoming.rrfScore),
    sourceUrl: existing.sourceUrl ?? incoming.sourceUrl,
  };
}

export function chunkRankingScore(c: ReferenceChunk): number {
  if (c.similarity != null && !Number.isNaN(c.similarity)) return c.similarity;
  if (c.rrfScore != null && !Number.isNaN(c.rrfScore)) return c.rrfScore;
  return 0;
}

type ContextLogger = {
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  performance: (metric: string, value: number, unit: string, meta?: Record<string, unknown>) => void;
};

export type SelectChunksOptions = {
  maxSelectedChunks?: number;
  /** Secondary sort: prefer chunks whose text overlaps question terms (list / enumeration RAG). */
  lexicalQuery?: string;
  /** Override CONTEXT_TOKEN_BUDGET (e.g. list queries: keep prompt focused on top reranked hits). */
  maxContextTokens?: number;
};

/** Count significant query tokens appearing in chunk text (cheap lexical grounding signal). */
function lexicalOverlapScore(chunk: ReferenceChunk, query: string): number {
  const normalized = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized
    .split(" ")
    .filter((w) => w.length > 2);
  if (tokens.length === 0) return 0;
  const text = chunk.content.toLowerCase();
  let hit = 0;
  for (const t of tokens) {
    if (text.includes(t)) hit++;
  }
  return hit;
}

/**
 * Selects chunks using token-based budgeting with relevance threshold.
 *
 * Strategy:
 * 1. Filter out chunks below minimum relevance threshold (quality floor)
 * 2. Sort remaining chunks by relevance score (descending)
 * 3. Add chunks one-by-one until token budget is exhausted
 * 4. Enforce hard maximum chunk limit as safety cap
 *
 * @param chunks - All retrieved chunks to select from
 * @param logger - Optional context logger
 * @param relevanceThreshold - Optional custom threshold (default: MIN_RELEVANCE_THRESHOLD)
 * @param options - Optional cap on chunk count and lexical re-ranking for list queries
 */
export function selectChunksByTokenBudget(
  chunks: ReferenceChunk[],
  logger?: ContextLogger,
  relevanceThreshold?: number,
  options?: SelectChunksOptions
): ReferenceChunk[] {
  const threshold = relevanceThreshold ?? MIN_RELEVANCE_THRESHOLD;
  let relevantChunks = chunks.filter(
    (chunk) => chunkRankingScore(chunk) >= threshold
  );

  // If retrieval returned candidates but the relevance floor filtered everything,
  // relax monotonically then fall back to top-by-score (production RAG pattern:
  // grounded answer with imperfect ranking beats empty context + ungrounded model guess).
  if (relevantChunks.length === 0 && chunks.length > 0) {
    const MIN_FALLBACK_FLOOR = 0.06;
    let relaxed = threshold;
    while (relevantChunks.length === 0 && relaxed > MIN_FALLBACK_FLOOR) {
      relaxed *= 0.72;
      relevantChunks = chunks.filter(
        (chunk) => chunkRankingScore(chunk) >= relaxed
      );
    }
    if (relevantChunks.length === 0) {
      const topN = Math.min(5, chunks.length);
      relevantChunks = [...chunks]
        .sort((a, b) => chunkRankingScore(b) - chunkRankingScore(a))
        .slice(0, topN);
      logger?.warn(
        `No chunks met relevance threshold ${threshold}; using top-${topN} by score as fallback`,
        { scores: relevantChunks.map((c) => chunkRankingScore(c)) }
      );
    } else {
      logger?.warn(
        `Relaxed relevance floor from ${threshold} to ${relaxed.toFixed(4)} (${relevantChunks.length} chunk(s))`
      );
    }
  }

  if (relevantChunks.length === 0) {
    logger?.warn("No chunks to select from");
    return [];
  }

  const lexQ = options?.lexicalQuery?.trim();
  const sortedChunks = [...relevantChunks].sort((a, b) => {
    if (!lexQ) {
      return chunkRankingScore(b) - chunkRankingScore(a);
    }
    const overlapWeight = 0.04;
    const ca =
      chunkRankingScore(a) + overlapWeight * lexicalOverlapScore(a, lexQ);
    const cb =
      chunkRankingScore(b) + overlapWeight * lexicalOverlapScore(b, lexQ);
    return cb - ca;
  });

  const selectedChunks: ReferenceChunk[] = [];
  let usedTokens = 0;
  const chunkCap = Math.min(
    options?.maxSelectedChunks ?? MAX_CHUNKS_HARD_LIMIT,
    MAX_CHUNKS_HARD_LIMIT
  );
  const tokenBudget = options?.maxContextTokens ?? CONTEXT_TOKEN_BUDGET;

  for (const chunk of sortedChunks) {
    if (selectedChunks.length >= chunkCap) {
      logger?.info(`Reached selection cap (${chunkCap}), stopping selection`);
      break;
    }

    const chunkTokens = countTokens(chunk.content);

    if (usedTokens + chunkTokens > tokenBudget) {
      if (selectedChunks.length > 0) {
        logger?.info(
          `Token budget exhausted (${usedTokens}/${tokenBudget} tokens), selected ${selectedChunks.length} chunks`
        );
        break;
      }
      logger?.warn(
        `Single chunk exceeds token budget (${chunkTokens} > ${tokenBudget}), including anyway`
      );
    }

    selectedChunks.push(chunk);
    usedTokens += chunkTokens;
  }

  const originalCount = chunks.length;
  const filteredCount = relevantChunks.length;
  const selectedCount = selectedChunks.length;

  logger?.performance("contextSelection", selectedCount, "chunks", {
    originalCount,
    filteredCount,
    threshold,
    usedTokens,
    tokenBudget,
  });

  return selectedChunks;
}

/**
 * Selects chunks with a reserved token budget for external sources.
 * Prevents external chunks from being starved out by high-scoring notebook chunks.
 *
 * Strategy:
 * 1. Reserve a fixed token budget for top-N external chunks
 * 2. Select notebook chunks from the reduced remaining budget
 * 3. Merge both pools (externals appended after notebooks)
 */
export function selectChunksByTokenBudgetWithReservation(
  notebookChunks: ReferenceChunk[],
  externalChunks: ReferenceChunk[],
  logger?: ContextLogger,
  relevanceThreshold?: number,
  options?: SelectChunksOptions
): ReferenceChunk[] {
  const EXTERNAL_RESERVED_TOKENS = 2000; // ~4-6 chunks
  const EXTERNAL_TOP_N = 5;

  // Always take top-N externals regardless of score
  const topExternals = [...externalChunks]
    .sort((a, b) => chunkRankingScore(b) - chunkRankingScore(a))
    .slice(0, EXTERNAL_TOP_N);

  const reducedBudget = (options?.maxContextTokens ?? CONTEXT_TOKEN_BUDGET) - EXTERNAL_RESERVED_TOKENS;

  const notebookSelected = selectChunksByTokenBudget(
    notebookChunks,
    logger,
    relevanceThreshold,
    { ...options, maxContextTokens: Math.max(reducedBudget, 1000) }
  );

  logger?.info("Chunk selection with reservation", {
    notebookSelected: notebookSelected.length,
    externalSelected: topExternals.length,
    reservedTokens: EXTERNAL_RESERVED_TOKENS,
  });

  return [...notebookSelected, ...topExternals];
}

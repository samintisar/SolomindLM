"use node";

import { countTokens } from "../_shared/tokenizer";
import type { ReferenceChunk } from "../../storage/ChatHistoryService";
import {
  CONTEXT_TOKEN_BUDGET,
  MAX_CHUNKS_HARD_LIMIT,
  MIN_RELEVANCE_THRESHOLD,
} from "./chatConfig.js";

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

/**
 * Selects chunks using token-based budgeting with relevance threshold.
 *
 * Strategy:
 * 1. Filter out chunks below minimum relevance threshold (quality floor)
 * 2. Sort remaining chunks by relevance score (descending)
 * 3. Add chunks one-by-one until token budget is exhausted
 * 4. Enforce hard maximum chunk limit as safety cap
 */
export function selectChunksByTokenBudget(
  chunks: ReferenceChunk[],
  logger?: ContextLogger
): ReferenceChunk[] {
  const relevantChunks = chunks.filter(
    (chunk) => chunkRankingScore(chunk) >= MIN_RELEVANCE_THRESHOLD
  );

  if (relevantChunks.length === 0) {
    logger?.warn(
      `No chunks met relevance threshold ${MIN_RELEVANCE_THRESHOLD}, returning empty context`
    );
    return [];
  }

  const sortedChunks = [...relevantChunks].sort(
    (a, b) => chunkRankingScore(b) - chunkRankingScore(a)
  );

  const selectedChunks: ReferenceChunk[] = [];
  let usedTokens = 0;

  for (const chunk of sortedChunks) {
    if (selectedChunks.length >= MAX_CHUNKS_HARD_LIMIT) {
      logger?.info(
        `Reached hard chunk limit (${MAX_CHUNKS_HARD_LIMIT}), stopping selection`
      );
      break;
    }

    const chunkTokens = countTokens(chunk.content);

    if (usedTokens + chunkTokens > CONTEXT_TOKEN_BUDGET) {
      if (selectedChunks.length > 0) {
        logger?.info(
          `Token budget exhausted (${usedTokens}/${CONTEXT_TOKEN_BUDGET} tokens), selected ${selectedChunks.length} chunks`
        );
        break;
      }
      logger?.warn(
        `Single chunk exceeds token budget (${chunkTokens} > ${CONTEXT_TOKEN_BUDGET}), including anyway`
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
    threshold: MIN_RELEVANCE_THRESHOLD,
    usedTokens,
    tokenBudget: CONTEXT_TOKEN_BUDGET,
  });

  return selectedChunks;
}

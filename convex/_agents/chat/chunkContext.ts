"use node";

import { countTokens } from "../_shared/tokenizer";
import {
  CONTEXT_TOKEN_BUDGET,
  MAX_CHUNKS_HARD_LIMIT,
  MIN_PASSAGES_PER_DOCUMENT,
  MIN_RELEVANCE_THRESHOLD,
  MULTI_SOURCE_EXTRA_TOKENS_PER_DOCUMENT,
  MULTI_SOURCE_MAX_EXTRA_TOKENS,
} from "./chatConfig.js";
import type { ReferenceChunk } from "./types";

export function chunkDedupKey(c: ReferenceChunk): string {
  return `${c.sourceId}:${c.chunkIndex}`;
}

export function mergeChunkScores(
  existing: ReferenceChunk,
  incoming: ReferenceChunk
): ReferenceChunk {
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
  performance: (
    metric: string,
    value: number,
    unit: string,
    meta?: Record<string, unknown>
  ) => void;
};

export type SelectChunksOptions = {
  maxSelectedChunks?: number;
  /** Secondary sort: prefer chunks whose text overlaps question terms (list / enumeration RAG). */
  lexicalQuery?: string;
  /** Override CONTEXT_TOKEN_BUDGET (e.g. list queries: keep prompt focused on top reranked hits). */
  maxContextTokens?: number;
  /**
   * Dedup keys of the passages the global rerank scored. Only these decide which documents are
   * relevant to the question; without them (rerank failed or skipped) no document gets a
   * guaranteed share and the budget is not widened.
   */
  rerankedKeys?: ReadonlySet<string>;
};

/** Count significant query tokens appearing in chunk text (cheap lexical grounding signal). */
function lexicalOverlapScore(chunk: ReferenceChunk, query: string): number {
  const normalized = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized.split(" ").filter((w) => w.length > 2);
  if (tokens.length === 0) return 0;
  const text = chunk.content.toLowerCase();
  let hit = 0;
  for (const t of tokens) {
    if (text.includes(t)) hit++;
  }
  return hit;
}

/**
 * Documents with at least one reranked passage at or above the relevance floor, ordered by
 * their best such passage. Passages outside the rerank keep their raw vector similarity (~0.5
 * even when unrelated, above the floor), so they never make a document count as relevant.
 */
export function documentsWithRerankedPassages(
  chunks: ReferenceChunk[],
  rerankedKeys: ReadonlySet<string> | undefined,
  threshold: number = MIN_RELEVANCE_THRESHOLD
): string[] {
  if (!rerankedKeys || rerankedKeys.size === 0) return [];
  const documents: string[] = [];
  const ranked = [...chunks].sort((a, b) => chunkRankingScore(b) - chunkRankingScore(a));
  for (const c of ranked) {
    if (!c.documentId || documents.includes(c.documentId)) continue;
    if (!rerankedKeys.has(chunkDedupKey(c)) || chunkRankingScore(c) < threshold) continue;
    documents.push(c.documentId);
  }
  return documents;
}

/**
 * Reserves each relevant document's best MIN_PASSAGES_PER_DOCUMENT passages, round-robin by
 * rank, within the token budget and chunk cap. Without this, one document that outscores the
 * others (it cites them, or matches the question's wording) fills the whole budget and the
 * answer covers only it.
 *
 * @returns Indices into `sorted` that are reserved; empty unless 2+ documents are relevant.
 */
function reserveDocumentShares(
  sorted: ReferenceChunk[],
  tokens: number[],
  tokenBudget: number,
  chunkCap: number,
  relevantDocuments: string[]
): Set<number> {
  const reserved = new Set<number>();
  if (relevantDocuments.length < 2) return reserved;

  const byDocument = new Map<string, number[]>(relevantDocuments.map((d) => [d, []]));
  sorted.forEach((c, i) => {
    if (c.documentId) byDocument.get(c.documentId)?.push(i);
  });

  let used = 0;
  for (let round = 0; round < MIN_PASSAGES_PER_DOCUMENT; round++) {
    for (const indices of byDocument.values()) {
      const i = indices[round];
      if (i === undefined || reserved.size >= chunkCap) continue;
      if (used + tokens[i] > tokenBudget) continue;
      reserved.add(i);
      used += tokens[i];
    }
  }
  return reserved;
}

/**
 * Selects chunks using token-based budgeting with relevance threshold.
 *
 * Strategy:
 * 1. Filter out chunks below minimum relevance threshold (quality floor)
 * 2. Sort remaining chunks by relevance score (descending)
 * 3. When reranked passages show 2+ relevant documents, widen the budget per extra document
 *    and reserve each one's top passages
 * 4. Add the rest one-by-one until token budget is exhausted
 * 5. Enforce hard maximum chunk limit as safety cap
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
  let relevantChunks = chunks.filter((chunk) => chunkRankingScore(chunk) >= threshold);

  // If retrieval returned candidates but the relevance floor filtered everything,
  // relax monotonically then fall back to top-by-score (production RAG pattern:
  // grounded answer with imperfect ranking beats empty context + ungrounded model guess).
  if (relevantChunks.length === 0 && chunks.length > 0) {
    const MIN_FALLBACK_FLOOR = 0.06;
    let relaxed = threshold;
    while (relevantChunks.length === 0 && relaxed > MIN_FALLBACK_FLOOR) {
      relaxed *= 0.72;
      relevantChunks = chunks.filter((chunk) => chunkRankingScore(chunk) >= relaxed);
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
    const ca = chunkRankingScore(a) + overlapWeight * lexicalOverlapScore(a, lexQ);
    const cb = chunkRankingScore(b) + overlapWeight * lexicalOverlapScore(b, lexQ);
    return cb - ca;
  });

  const chunkCap = Math.min(
    options?.maxSelectedChunks ?? MAX_CHUNKS_HARD_LIMIT,
    MAX_CHUNKS_HARD_LIMIT
  );
  const relevantDocuments = documentsWithRerankedPassages(
    relevantChunks,
    options?.rerankedKeys,
    threshold
  );
  const extraTokens =
    relevantDocuments.length > 1
      ? Math.min(
          (relevantDocuments.length - 1) * MULTI_SOURCE_EXTRA_TOKENS_PER_DOCUMENT,
          MULTI_SOURCE_MAX_EXTRA_TOKENS
        )
      : 0;
  const tokenBudget = (options?.maxContextTokens ?? CONTEXT_TOKEN_BUDGET) + extraTokens;
  const tokens = sortedChunks.map((c) => countTokens(c.content));

  const selectedIdx = reserveDocumentShares(
    sortedChunks,
    tokens,
    tokenBudget,
    chunkCap,
    relevantDocuments
  );
  let usedTokens = 0;
  for (const i of selectedIdx) usedTokens += tokens[i];
  if (selectedIdx.size > 0) {
    logger?.info("Reserved passages per relevant document", {
      relevantDocuments: relevantDocuments.length,
      reservedChunks: selectedIdx.size,
      reservedTokens: usedTokens,
      tokenBudget,
    });
  }

  for (let i = 0; i < sortedChunks.length; i++) {
    if (selectedIdx.has(i)) continue;
    if (selectedIdx.size >= chunkCap) {
      logger?.info(`Reached selection cap (${chunkCap}), stopping selection`);
      break;
    }

    const chunkTokens = tokens[i];

    if (usedTokens + chunkTokens > tokenBudget) {
      if (selectedIdx.size > 0) {
        logger?.info(
          `Token budget exhausted (${usedTokens}/${tokenBudget} tokens), selected ${selectedIdx.size} chunks`
        );
        break;
      }
      logger?.warn(
        `Single chunk exceeds token budget (${chunkTokens} > ${tokenBudget}), including anyway`
      );
    }

    selectedIdx.add(i);
    usedTokens += chunkTokens;
  }

  const selectedChunks = [...selectedIdx].sort((a, b) => a - b).map((i) => sortedChunks[i]);

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
 * 1. Reserve up to a fixed token budget for top-N external chunks (none when there are none)
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

  // Reserve only what the externals need: with none, notebook passages get the whole budget.
  const reservedTokens = Math.min(
    EXTERNAL_RESERVED_TOKENS,
    topExternals.reduce((sum, c) => sum + countTokens(c.content), 0)
  );
  const reducedBudget = (options?.maxContextTokens ?? CONTEXT_TOKEN_BUDGET) - reservedTokens;

  const notebookSelected = selectChunksByTokenBudget(notebookChunks, logger, relevanceThreshold, {
    ...options,
    maxContextTokens: Math.max(reducedBudget, 1000),
  });

  logger?.info("Chunk selection with reservation", {
    notebookSelected: notebookSelected.length,
    externalSelected: topExternals.length,
    reservedTokens,
  });

  return [...notebookSelected, ...topExternals];
}

export type NeighbourPassageOptions = {
  /** Tokens the added neighbours may use in total. */
  tokenBudget: number;
  /** Most neighbours to add. */
  maxPassages: number;
};

const positionKey = (documentId: string, chunkIndex: number) => `${documentId}#${chunkIndex}`;

/**
 * Adds the whole neighbouring passages of selected passages, when retrieval already found them,
 * so text the model would otherwise only see as a ~100-character preview becomes a passage it
 * can cite. Best-ranked passages go first, the next neighbour before the previous one; each
 * neighbour sits beside its passage. Previews of passages that end up in the context are then
 * dropped, since the full text is there.
 *
 * @param selected - Context passages in rank order
 * @param pool - Every retrieved passage the neighbours may come from
 */
export function addNeighbourPassages(
  selected: ReferenceChunk[],
  pool: ReferenceChunk[],
  options: NeighbourPassageOptions
): ReferenceChunk[] {
  const byPosition = new Map<string, ReferenceChunk>();
  for (const c of pool) {
    if (c.documentId && c.chunkIndex >= 0)
      byPosition.set(positionKey(c.documentId, c.chunkIndex), c);
  }
  const inContext = new Set(
    selected
      .filter((c) => c.documentId && c.chunkIndex >= 0)
      .map((c) => positionKey(c.documentId as string, c.chunkIndex))
  );

  const result = [...selected];
  let usedTokens = 0;
  let added = 0;
  for (const anchor of selected) {
    if (!anchor.documentId || anchor.chunkIndex < 0) continue;
    const steps: Array<1 | -1> = [];
    if (anchor.metadata?.nextChunkPreview) steps.push(1);
    if (anchor.metadata?.previousChunkPreview) steps.push(-1);
    for (const step of steps) {
      if (added >= options.maxPassages) break;
      const key = positionKey(anchor.documentId, anchor.chunkIndex + step);
      const neighbour = byPosition.get(key);
      if (!neighbour || inContext.has(key)) continue;
      const tokens = countTokens(neighbour.content);
      if (usedTokens + tokens > options.tokenBudget) continue;
      const at = result.indexOf(anchor);
      result.splice(step === 1 ? at + 1 : at, 0, neighbour);
      inContext.add(key);
      usedTokens += tokens;
      added++;
    }
  }

  return result.map((c) => {
    if (!c.documentId || c.chunkIndex < 0 || !c.metadata) return c;
    const hasNext = inContext.has(positionKey(c.documentId, c.chunkIndex + 1));
    const hasPrevious = inContext.has(positionKey(c.documentId, c.chunkIndex - 1));
    if (!hasNext && !hasPrevious) return c;
    return {
      ...c,
      metadata: {
        ...c.metadata,
        ...(hasNext ? { nextChunkPreview: undefined } : {}),
        ...(hasPrevious ? { previousChunkPreview: undefined } : {}),
      },
    };
  });
}

"use node";
/// <reference path="./zeroentropy.d.ts" />
/**
 * Vector search for chat agent.
 *
 * Handles vector search with Convex + ZeroEntropy reranking.
 * ChatAgent calls search(userId, noteId, query, documentIds).
 */

import { env } from "../../_lib/env";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import type { ReferenceChunk, ChunkMetadata } from "../../storage/ChatHistoryService";
import type { EmbeddingService } from "../../_services/processing/EmbeddingServiceClient";

// Re-export ReferenceChunk for other modules
export type { ReferenceChunk };

// ============================================================
// Types
// ============================================================

export interface VectorSearchRawResult {
  _id: string;
  _score: number;
  content: string;
  chunkIndex: number;
  documentId?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  // Chunk metadata for enhanced RAG context
  metadata?: ChunkMetadata;
}

/**
 * Runner passed in by Convex (or tests): runs vector search and returns raw results.
 */
export type VectorSearchRunner = (
  embedding: number[],
  limit: number,
  documentIds: string[] | undefined
) => Promise<VectorSearchRawResult[]>;

/**
 * Configuration for vector search.
 */
export interface VectorSearchConfig {
  vectorMatchThreshold?: number;
  vectorMatchCount?: number;
  rerankThreshold?: number;
  rerankTopN?: number;
  maxResults?: number;
}

/**
 * Result of vector search with metadata.
 */
export interface VectorSearchResult extends ReferenceChunk {
  similarity?: number;
}

/**
 * Reranking function type for dependency injection (supports caching)
 */
export type RerankFunction = (
  query: string,
  documents: Array<{ id: string; content: string }>
) => Promise<Array<{ id: string; content: string; score?: number }>>;

const DEFAULT_CONFIG: Required<VectorSearchConfig> = {
  vectorMatchThreshold: 0.3,
  vectorMatchCount: 25,
  rerankThreshold: 5,
  rerankTopN: 15,
  maxResults: 7,
};

// ============================================================
// Vector Search Class
// ============================================================

/**
 * Handles vector search for the chat agent: embed query → Convex search → optional ZeroEntropy rerank.
 */
export class VectorSearchHandler {
  protected config: Required<VectorSearchConfig>;
  protected embeddingService: EmbeddingService;
  protected vectorSearchRunner: VectorSearchRunner;
  protected rerankFn?: RerankFunction;

  constructor(
    config?: VectorSearchConfig,
    embeddingService?: EmbeddingService,
    vectorSearchRunner?: VectorSearchRunner,
    rerankFn?: RerankFunction
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.embeddingService = embeddingService ?? (null as any);
    this.vectorSearchRunner = vectorSearchRunner ?? (null as any);
    this.rerankFn = rerankFn;
  }

  /**
   * Same signature as legacy API: search(userId, noteId, query, documentIds).
   * Flow: embed query → runner (Convex vector search) → threshold filter → dedupe → ZeroEntropy rerank → slice(maxResults).
   */
  async search(
    userId: string,
    noteId: string,
    query: string,
    documentIds?: string[],
    preComputedEmbedding?: number[],
    /** Extra text (e.g. HyDE paragraph) appended for reranking only — does not change the embedding. */
    retrievalAugmentForRerank?: string,
    options?: { skipRerank?: boolean; allowEmpty?: boolean; quiet?: boolean }
  ): Promise<ReferenceChunk[]> {
    if (!this.embeddingService || !this.vectorSearchRunner) {
      throw new Error(
        "VectorSearchHandler must be constructed with embeddingService and vectorSearchRunner when using search(userId, noteId, query, documentIds)."
      );
    }

    const quiet = options?.quiet === true;
    const log = createServiceLogger("vectorSearch", "search", {
      userId,
      notebookId: noteId,
    });
    const t0 = Date.now();

    if (!quiet) {
      log.debug("query", { preview: query.slice(0, 120), length: query.length });
      log.debug("params", {
        threshold: this.config.vectorMatchThreshold,
        count: this.config.vectorMatchCount,
        rerankTopN: this.config.rerankTopN,
      });
    }

    if (!quiet && preComputedEmbedding) {
      log.debug("embedding", { source: "precomputed_hyde" });
    }
    const queryEmbedding = preComputedEmbedding ?? (await this.embeddingService.embedText(query));
    const raw = await this.vectorSearchRunner(
      queryEmbedding,
      this.config.vectorMatchCount,
      documentIds
    );

    if (!quiet) {
      log.debug("raw_results", { count: raw.length });
    }

    // No fallback: respect the user's document selection strictly

    const withScore = raw.map((r) => ({
      ...r,
      similarity: r._score ?? 0,
    }));

    if (!quiet && raw.length > 0) {
      const scores = withScore.map((r) => r.similarity);
      log.debug("scores", {
        min: Math.min(...scores),
        max: Math.max(...scores),
        avg: scores.reduce((a, b) => a + b, 0) / scores.length,
        first5: scores.slice(0, 5),
        threshold: this.config.vectorMatchThreshold,
      });
    }

    let filtered = withScore.filter(
      (r) => (r.similarity ?? 0) >= this.config.vectorMatchThreshold
    );
    if (!quiet) {
      log.debug("after_threshold", { count: filtered.length });
    }

    // Align with vectorSearchRunner last-resort: if the runner returned candidates but
    // none meet the global threshold, still use the best-scoring chunks (weak retrieval).
    if (filtered.length === 0 && raw.length > 0) {
      const take = Math.min(
        Math.max(this.config.vectorMatchCount, this.config.maxResults),
        raw.length
      );
      log.warn("Weak fallback: no chunks above threshold; using top by score", {
        threshold: this.config.vectorMatchThreshold,
        take,
      });
      filtered = [...withScore]
        .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
        .slice(0, take);
    }

    const deduped = this.deduplicateResults(filtered);
    if (!quiet) {
      log.debug("after_dedup", { count: deduped.length });
    }

    const allowEmpty = options?.allowEmpty === true;
    if (deduped.length === 0 && allowEmpty) {
      return [];
    }

    const augment = retrievalAugmentForRerank?.trim();
    const rerankQuery = augment
      ? `${query.trim()}\n\n${augment.length > 2000 ? augment.slice(0, 2000) : augment}`
      : query;

    let ranked: (VectorSearchRawResult & { similarity?: number })[];
    if (options?.skipRerank) {
      ranked = [...deduped].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
    } else {
      ranked = await this.rerankResults(rerankQuery, deduped, quiet);
    }

    const pool = options?.skipRerank
      ? Math.max(this.config.maxResults, this.config.rerankTopN)
      : this.config.maxResults;
    const limited = ranked.slice(0, pool);

    // FIX: Preserve original positions from raw results to maintain citation consistency
    // Create a map of original positions for all raw results
    const originalPositionMap = new Map<string, number>();
    raw.forEach((r, idx) => {
      const key = `${r._id}-${r.chunkIndex}`;
      originalPositionMap.set(key, idx + 1); // 1-based indexing
    });

    const finalResults: ReferenceChunk[] = limited.map((r) => {
      const key = `${r._id}-${r.chunkIndex}`;
      const originalPosition = originalPositionMap.get(key) ?? 0;
      return {
        id: String(originalPosition),
        sourceId: String(r._id),
        documentId: r.documentId,
        sourceTitle: r.sourceTitle ?? "Document",
        sourceUrl: r.sourceUrl,
        content: r.content,
        chunkIndex: r.chunkIndex,
        similarity: r.similarity,
        // Include chunk metadata
        metadata: r.metadata,
      };
    });

    const latencyMs = Date.now() - t0;
    log.performance("vector_search", latencyMs, "ms", {
      quiet,
      final_count: finalResults.length,
    });

    if (finalResults.length === 0 && allowEmpty) {
      return [];
    }

    if (finalResults.length === 0) {
      if (documentIds?.length) {
        // User selected specific documents but no relevant content was found
        if (raw.length === 0) {
          throw new Error(
            `No results found in your selected documents. The selected documents don't contain any content matching your query. Try selecting different documents or rephrasing your question.`
          );
        } else {
          const scores = raw.map((r) => r._score ?? 0);
          const maxScore = Math.max(...scores);
          throw new Error(
            `No results found in your selected documents. Found ${raw.length} chunks but all scores are below threshold. ` +
              `Max score: ${maxScore.toFixed(4)}, Threshold: ${this.config.vectorMatchThreshold}. ` +
              `The selected documents may not contain relevant information for your query.`
          );
        }
      } else {
        // No document filter - general error
        if (raw.length === 0) {
          throw new Error(
            `No results found. No chunks found for this notebook. Please check that documents have been processed and embeddings have been generated.`
          );
        } else {
          const scores = raw.map((r) => r._score ?? 0);
          const maxScore = Math.max(...scores);
          throw new Error(
            `No results found. Found ${raw.length} chunks but all scores are below threshold. ` +
              `Max score: ${maxScore.toFixed(4)}, Threshold: ${this.config.vectorMatchThreshold}. ` +
              `This may indicate an issue with embedding quality or document processing.`
          );
        }
      }
    }

    return finalResults;
  }

  protected deduplicateResults(
    results: (VectorSearchRawResult & { similarity?: number })[]
  ): (VectorSearchRawResult & { similarity?: number })[] {
    const seen = new Set<string>();
    const out: (VectorSearchRawResult & { similarity?: number })[] = [];
    for (const r of results) {
      const key = `${r._id}-${r.chunkIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }

  protected async rerankResults(
    query: string,
    results: (VectorSearchRawResult & { similarity?: number })[],
    quiet?: boolean
  ): Promise<(VectorSearchRawResult & { similarity?: number })[]> {
    const key = env.ZEROENTROPY_API_KEY;
    if (!key || results.length <= this.config.rerankThreshold) {
      if (!quiet) {
        const log = createServiceLogger("vectorSearch", "rerank");
        log.debug("skip_rerank", { hasKey: !!key, results: results.length });
      }
      return results;
    }

    // If a cached reranking function is provided, use it
    if (this.rerankFn) {
      if (!quiet) {
        const log = createServiceLogger("vectorSearch", "rerank");
        log.debug("rerank_path", { source: "cached_fn" });
      }
      try {
        const documents = results.map((r) => ({
          id: r._id,
          content: r.content,
        }));

        const rerankedDocs = await this.rerankFn(query, documents);

        const reranked: (VectorSearchRawResult & { similarity?: number })[] = [];
        const seen = new Set<string>();

        // Add reranked results in order
        for (const doc of rerankedDocs) {
          const original = results.find((r) => r._id === doc.id);
          if (original && !seen.has(original._id)) {
            reranked.push({
              ...original,
              similarity: doc.score ?? original.similarity,
            });
            seen.add(original._id);
          }
        }

        // Add any documents not in reranked results (preserving original order)
        for (const r of results) {
          if (!seen.has(r._id)) {
            reranked.push(r);
            seen.add(r._id);
          }
        }

        if (!quiet) {
          const log = createServiceLogger("vectorSearch", "rerank");
          log.debug("rerank_complete", { count: reranked.length, path: "cached" });
        }
        return reranked;
      } catch (err: any) {
        const log = createServiceLogger("vectorSearch", "rerank");
        log.error("cached_rerank_failed", err, { message: err?.message });
        // Fall through to direct API call
      }
    }

    // Direct API call (original implementation)
    const model = env.ZEROENTROPY_RERANK_MODEL || "zerank-2";
    const maxRetries = 3;
    const baseDelay = 1000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { ZeroEntropy } = await import("zeroentropy");
        const zclient = new ZeroEntropy({ apiKey: key });
        const documents = results.map((r) => r.content);

        const response = await zclient.models.rerank({
          model,
          query,
          documents,
          top_n: this.config.rerankTopN,
        });

        const reranked: (VectorSearchRawResult & { similarity?: number })[] = [];
        const seen = new Set<string>();

        if (response.results && Array.isArray(response.results)) {
          for (const item of response.results) {
            const idx = item.index;
            if (typeof idx !== "number" || idx < 0 || idx >= results.length) continue;
            const original = results[idx];
            if (!original) continue;
            const k = `${original._id}-${original.chunkIndex}`;
            if (seen.has(k)) continue;
            seen.add(k);
            reranked.push({
              ...original,
              similarity: item.relevance_score ?? original.similarity,
            });
          }
        }

        for (const r of results) {
          const k = `${r._id}-${r.chunkIndex}`;
          if (!seen.has(k)) {
            reranked.push(r);
            seen.add(k);
          }
        }

        if (!quiet) {
          const log = createServiceLogger("vectorSearch", "rerank");
          log.debug("rerank_complete", { count: reranked.length, path: "zeroentropy" });
        }
        return reranked;
      } catch (err: any) {
        const log = createServiceLogger("vectorSearch", "rerank");
        const is429 = err?.statusCode === 429 || err?.status === 429;
        const last = attempt === maxRetries - 1;
        if (is429 && !last) {
          const delay = baseDelay * Math.pow(2, attempt);
          log.warn("rate_limit_retry", { delayMs: delay, attempt: attempt + 1, maxRetries });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        log.error("rerank_failed", err, { message: err?.message });
        return results;
      }
    }
    return results;
  }
}

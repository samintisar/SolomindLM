"use node";
/// <reference path="./zeroentropy.d.ts" />
/**
 * Vector search for chat agent.
 *
 * Handles vector search with Convex + ZeroEntropy reranking.
 * ChatAgent calls search(userId, noteId, query, documentIds).
 */

import { env } from '../../_lib/env';
import type { ReferenceChunk, ChunkMetadata } from '../../storage/ChatHistoryService';
import type { EmbeddingService } from '../../_services/processing/EmbeddingServiceClient';

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
    options?: { skipRerank?: boolean; allowEmpty?: boolean }
  ): Promise<ReferenceChunk[]> {
    if (!this.embeddingService || !this.vectorSearchRunner) {
      throw new Error(
        'VectorSearchHandler must be constructed with embeddingService and vectorSearchRunner when using search(userId, noteId, query, documentIds).'
      );
    }

    console.log(`[VectorSearch] query="${query.slice(0, 80)}..."`);
    console.log(
      `[VectorSearch] params: threshold=${this.config.vectorMatchThreshold}, count=${this.config.vectorMatchCount}, rerankTopN=${this.config.rerankTopN}`
    );

    if (preComputedEmbedding) {
      console.log('[VectorSearch] Using pre-computed HyDE embedding');
    }
    const queryEmbedding = preComputedEmbedding ?? await this.embeddingService.embedText(query);
    let raw = await this.vectorSearchRunner(
      queryEmbedding,
      this.config.vectorMatchCount,
      documentIds
    );

    console.log(`[VectorSearch] Raw results from runner: ${raw.length}`);

    // No fallback: respect the user's document selection strictly

    const withScore = raw.map((r) => ({
      ...r,
      similarity: r._score ?? 0,
    }));

    // Debug: Log all scores before filtering
    if (raw.length > 0) {
      const scores = withScore.map((r) => r.similarity);
      console.log(`[VectorSearch] Scores:`, {
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
    console.log(`[VectorSearch] After threshold: ${filtered.length} results`);

    // No threshold fallback when documentIds are strictly enforced

    const deduped = this.deduplicateResults(filtered);
    console.log(`[VectorSearch] After dedup: ${deduped.length}`);

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
      ranked = [...deduped].sort(
        (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)
      );
    } else {
      ranked = await this.rerankResults(rerankQuery, deduped);
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
        sourceTitle: r.sourceTitle ?? 'Document',
        sourceUrl: r.sourceUrl,
        content: r.content,
        chunkIndex: r.chunkIndex,
        similarity: r.similarity,
        // Include chunk metadata
        metadata: r.metadata,
      };
    });

    console.log(`[VectorSearch] final: ${finalResults.length} results`);

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
    results: (VectorSearchRawResult & { similarity?: number })[]
  ): Promise<(VectorSearchRawResult & { similarity?: number })[]> {
    const key = env.ZEROENTROPY_API_KEY;
    if (!key || results.length <= this.config.rerankThreshold) {
      console.log(
        `[VectorSearch] Skipping reranking: key=${!!key}, results=${results.length}`
      );
      return results;
    }

    // If a cached reranking function is provided, use it
    if (this.rerankFn) {
      console.log(`[VectorSearch] Using cached reranking function`);
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

        console.log(`[VectorSearch] Reranked ${reranked.length} documents (cached)`);
        return reranked;
      } catch (err: any) {
        console.error('[VectorSearch] Cached rerank failed, falling back:', err?.message);
        // Fall through to direct API call
      }
    }

    // Direct API call (original implementation)
    const model = env.ZEROENTROPY_RERANK_MODEL || 'zerank-2';
    const maxRetries = 3;
    const baseDelay = 1000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { ZeroEntropy } = await import('zeroentropy');
        const zclient = new ZeroEntropy({ apiKey: key });
        const documents = results.map((r) => r.content);

        const response = await zclient.models.rerank({
          model,
          query,
          documents,
          top_n: this.config.rerankTopN,
        });

        const resultMap = new Map(results.map((r) => [r.content, r]));
        const reranked: (VectorSearchRawResult & { similarity?: number })[] = [];
        const seen = new Set<(VectorSearchRawResult & { similarity?: number })>();

        if (response.results && Array.isArray(response.results)) {
          for (const item of response.results as { text?: string; document?: string }[]) {
            const text = item.text ?? item.document;
            const original = text ? resultMap.get(text) : undefined;
            if (original && !seen.has(original)) {
              reranked.push(original);
              seen.add(original);
            }
          }
        }

        for (const r of results) {
          if (!seen.has(r)) {
            reranked.push(r);
            seen.add(r);
          }
        }

        console.log(`[VectorSearch] Reranked ${reranked.length} documents`);
        return reranked;
      } catch (err: any) {
        const is429 =
          err?.statusCode === 429 || err?.status === 429;
        const last = attempt === maxRetries - 1;
        if (is429 && !last) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.warn(
            `[VectorSearch] Rate limit (429), retry in ${delay}ms (${attempt + 1}/${maxRetries})`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        console.error('[VectorSearch] Rerank failed:', err?.message);
        return results;
      }
    }
    return results;
  }
}

"use node";
/// <reference path="./zeroentropy.d.ts" />
/**
 * Vector search for chat agent.
 *
 * Handles vector search with Convex + ZeroEntropy reranking.
 * ChatAgent calls search(userId, noteId, query, documentIds).
 */

import { env } from '../../helpers/env';
import type { ReferenceChunk } from 'storage/ChatHistoryService.js';
import type { EmbeddingService } from '../../processing/EmbeddingServiceClient';

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

  constructor(
    config?: VectorSearchConfig,
    embeddingService?: EmbeddingService,
    vectorSearchRunner?: VectorSearchRunner
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.embeddingService = embeddingService ?? (null as any);
    this.vectorSearchRunner = vectorSearchRunner ?? (null as any);
  }

  /**
   * Same signature as legacy API: search(userId, noteId, query, documentIds).
   * Flow: embed query → runner (Convex vector search) → threshold filter → dedupe → ZeroEntropy rerank → slice(maxResults).
   */
  async search(
    userId: string,
    noteId: string,
    query: string,
    documentIds?: string[]
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

    const queryEmbedding = await this.embeddingService.embedText(query);
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

    const reranked = await this.rerankResults(query, deduped);
    const limited = reranked.slice(0, this.config.maxResults);

    const finalResults: ReferenceChunk[] = limited.map((r, index) => ({
      id: String(index + 1),
      sourceId: String(r._id),
      sourceTitle: r.sourceTitle ?? 'Document',
      content: r.content,
      chunkIndex: r.chunkIndex,
      similarity: r.similarity,
    }));

    console.log(`[VectorSearch] final: ${finalResults.length} results`);

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
    const model = env.ZEROENTROPY_RERANK_MODEL || 'zerank-2';
    if (!key || results.length <= this.config.rerankThreshold) {
      console.log(
        `[VectorSearch] Skipping reranking: key=${!!key}, results=${results.length}`
      );
      return results;
    }

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

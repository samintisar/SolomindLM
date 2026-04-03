/**
 * Hybrid search: vector + keyword with RRF fusion.
 * Extends VectorSearchHandler for backward compatibility.
 *
 * TYPE-SAFE: No "use node" directive - this is a library file.
 */

import type { ReferenceChunk, ChunkMetadata } from '../../storage/ChatHistoryService';
import type { EmbeddingService } from '../../_services/processing/EmbeddingServiceClient';
import {
  VectorSearchHandler,
  VectorSearchRunner,
  VectorSearchRawResult,
  VectorSearchConfig,
  RerankFunction,
} from './vector_search.js';

// ============================================================
// Types
// ============================================================

export interface KeywordSearchRawResult {
  _id: string;
  _score: number;
  content: string;
  chunkIndex: number;
  documentId?: string;
  sourceTitle?: string;
  // Chunk metadata for enhanced RAG context
  metadata?: ChunkMetadata;
}

/**
 * Closure-based runner (noteId and userId captured in outer scope)
 */
export type KeywordSearchRunner = (
  query: string,
  limit: number,
  documentIds?: string[]
) => Promise<KeywordSearchRawResult[]>;

export interface HybridSearchConfig extends VectorSearchConfig {
  keywordMatchCount?: number;
  rrfK?: number;
  enableHybrid?: boolean;
  hybridThreshold?: number;
}

/**
 * Extended reference chunk with hybrid-specific fields
 */
export interface HybridReferenceChunk extends ReferenceChunk {
  rrfScore?: number;
  vectorRank?: number;
  keywordRank?: number;
}

interface RRFResult extends VectorSearchRawResult {
  rrfScore: number;
  vectorRank?: number;
  keywordRank?: number;
}

const DEFAULT_HYBRID_CONFIG: Required<HybridSearchConfig> = {
  vectorMatchThreshold: 0.3,
  vectorMatchCount: 25,
  rerankThreshold: 5,
  rerankTopN: 15,
  maxResults: 7,
  keywordMatchCount: 25,
  rrfK: 60,
  enableHybrid: true,
  // RRF scores are bounded by 1/(k+1) ≈ 0.016 (single list) to 2/(k+1) ≈ 0.033 (both lists).
  // A threshold of 0.012 keeps chunks that appear in at least one list near the top.
  hybridThreshold: 0.012,
};

// ============================================================
// Query Preprocessing
// ============================================================

function preprocessQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')  // Keep hyphens and apostrophes
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// RRF Algorithm
// ============================================================

/**
 * Reciprocal Rank Fusion: score(d) = sum(1 / (k + rank_i(d)))
 */
function reciprocalRankFusion(
  vectorResults: (VectorSearchRawResult & { rank: number })[],
  keywordResults: (KeywordSearchRawResult & { rank: number })[],
  k: number = 60
): RRFResult[] {
  const scoreMap = new Map<string, RRFResult>();

  for (const result of vectorResults) {
    const key = `${result._id}-${result.chunkIndex}`;
    scoreMap.set(key, {
      ...result,
      rrfScore: 1 / (k + result.rank),
      vectorRank: result.rank,
      keywordRank: undefined,
    });
  }

  for (const result of keywordResults) {
    const key = `${result._id}-${result.chunkIndex}`;
    const rrfScore = 1 / (k + result.rank);
    const existing = scoreMap.get(key);
    if (existing) {
      existing.rrfScore += rrfScore;
      existing.keywordRank = result.rank;
    } else {
      scoreMap.set(key, {
        ...result,
        rrfScore,
        vectorRank: undefined,
        keywordRank: result.rank,
      });
    }
  }

  return Array.from(scoreMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}

// ============================================================
// Hybrid Search Class
// ============================================================

export class HybridSearchHandler extends VectorSearchHandler {
  private hybridConfig: Required<HybridSearchConfig>;
  private keywordSearchRunner: KeywordSearchRunner;

  constructor(
    config?: HybridSearchConfig,
    embeddingService?: EmbeddingService,
    vectorSearchRunner?: VectorSearchRunner,
    keywordSearchRunner?: KeywordSearchRunner,
    rerankFn?: RerankFunction
  ) {
    super(config, embeddingService, vectorSearchRunner, rerankFn);
    this.hybridConfig = { ...DEFAULT_HYBRID_CONFIG, ...config };
    this.keywordSearchRunner = keywordSearchRunner ?? (null as any);
  }

  /**
   * Override search to return HybridReferenceChunk (type-safe extension)
   */
  async search(
    userId: string,
    noteId: string,
    query: string,
    documentIds?: string[],
    preComputedEmbedding?: number[],
    retrievalAugmentForRerank?: string
  ): Promise<HybridReferenceChunk[]> {
    if (!this.hybridConfig.enableHybrid || !this.keywordSearchRunner) {
      // Vector-only: cast to base type for compatibility
      return (await super.search(
        userId,
        noteId,
        query,
        documentIds,
        preComputedEmbedding,
        retrievalAugmentForRerank
      )) as HybridReferenceChunk[];
    }

    const startTime = Date.now();
    console.log(`[HybridSearch] query="${query.slice(0, 80)}..."`);

    try {
      // Parallel retrieval
      const [vectorResults, keywordResults] = await Promise.all([
        this.executeVectorSearch(query, documentIds, preComputedEmbedding),
        this.executeKeywordSearch(query, documentIds),
      ]);

      const overlap = vectorResults.length + keywordResults.length;
      console.log(`[HybridSearch] vector=${vectorResults.length}, keyword=${keywordResults.length}`);

      // No fallback: respect the user's document selection strictly

      // RRF fusion
      const fused = reciprocalRankFusion(
        vectorResults.map((r, i) => ({ ...r, rank: i + 1 })),
        keywordResults.map((r, i) => ({ ...r, rank: i + 1 })),
        this.hybridConfig.rrfK
      );

      const overlapCount = fused.filter(r => r.vectorRank && r.keywordRank).length;

      // Threshold filter
      let filtered = fused.filter(r => r.rrfScore >= this.hybridConfig.hybridThreshold);
      if (filtered.length === 0) filtered = fused; // Fallback

      // Rerank (reuse parent's ZeroEntropy via protected method)
      // Store RRF metadata before reranking to preserve it
      const rrfMetadataMap = new Map<string, Pick<RRFResult, 'rrfScore' | 'vectorRank' | 'keywordRank'>>();
      for (const r of filtered) {
        const key = `${r._id}-${r.chunkIndex}`;
        rrfMetadataMap.set(key, {
          rrfScore: r.rrfScore,
          vectorRank: r.vectorRank,
          keywordRank: r.keywordRank,
        });
      }

      const augment = retrievalAugmentForRerank?.trim();
      const rerankQuery = augment
        ? `${query.trim()}\n\n${augment.length > 2000 ? augment.slice(0, 2000) : augment}`
        : query;
      const reranked = await this.rerankResults(rerankQuery, filtered);
      const limited = reranked.slice(0, this.hybridConfig.maxResults);

      const finalResults: HybridReferenceChunk[] = limited.map((r, index) => {
        const key = `${r._id}-${r.chunkIndex}`;
        const rrfMeta = rrfMetadataMap.get(key);
        return {
          id: String(index + 1),
          sourceId: String(r._id),
          sourceTitle: r.sourceTitle ?? 'Document',
          content: r.content,
          chunkIndex: r.chunkIndex,
          similarity: r._score ?? r.similarity,
          rrfScore: rrfMeta?.rrfScore,
          vectorRank: rrfMeta?.vectorRank,
          keywordRank: rrfMeta?.keywordRank,
          // Include chunk metadata
          metadata: r.metadata,
        };
      });

      // Telemetry
      console.log('[HybridSearch] metrics', {
        query_length: query.length,
        vector_count: vectorResults.length,
        keyword_count: keywordResults.length,
        fused_count: fused.length,
        overlap_count: overlapCount,
        top_rrf_score: fused[0]?.rrfScore.toFixed(4),
        final_count: finalResults.length,
        latency_ms: Date.now() - startTime,
      });

      return finalResults;
    } catch (error: any) {
      // Re-throw error instead of falling back
      throw error;
    }
  }

  /**
   * TYPE-SAFE: Access protected properties from parent class
   */
  private async executeVectorSearch(
    query: string,
    documentIds?: string[],
    preComputedEmbedding?: number[]
  ): Promise<VectorSearchRawResult[]> {
    const embedding = preComputedEmbedding ?? await this['embeddingService'].embedText(query);
    return await this['vectorSearchRunner'](embedding, this['config'].vectorMatchCount, documentIds);
  }

  private async executeKeywordSearch(
    query: string,
    documentIds?: string[]
  ): Promise<KeywordSearchRawResult[]> {
    const processedQuery = preprocessQuery(query);
    return await this.keywordSearchRunner(processedQuery, this.hybridConfig.keywordMatchCount, documentIds);
  }
}

export type { ReferenceChunk };

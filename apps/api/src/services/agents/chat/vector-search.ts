/**
 * Vector search for chat agent.
 *
 * Handles hybrid search (vector + keyword) with ZeroEntropy zerank reranking
 * and result deduplication.
 */

import { supabase } from '../../../config/database.js';
import { env } from '../../../config/env.js';
import { EmbeddingService } from '../../processing/EmbeddingService.js';
import type { ReferenceChunk } from '../../storage/ChatHistoryService.js';

// Re-export ReferenceChunk for other modules
export type { ReferenceChunk };

// ============================================================
// Types
// ============================================================

/**
 * Configuration for vector search.
 */
export interface VectorSearchConfig {
  /** Vector similarity threshold (default: 0.4) */
  vectorMatchThreshold?: number;
  /** Number of matches to return (default: 25) */
  vectorMatchCount?: number;
  /** Minimum results before reranking (default: 5) */
  rerankThreshold?: number;
  /** Top N results to keep after reranking (default: 15) */
  rerankTopN?: number;
  /** Maximum final results to return (default: 7) */
  maxResults?: number;
}

/**
 * Result of vector search with metadata.
 */
export interface VectorSearchResult extends ReferenceChunk {
  /** RRF (Reciprocal Rank Fusion) score */
  rrfScore?: number;
  /** Rank from vector search */
  vectorRank?: number;
  /** Rank from keyword search */
  keywordRank?: number;
}

// ============================================================
// Constants
// ============================================================

/** Default configuration for vector search */
const DEFAULT_CONFIG: Required<VectorSearchConfig> = {
  vectorMatchThreshold: 0.3, // Lowered from 0.4 to capture semantically related but not exact matches
  vectorMatchCount: 25,
  rerankThreshold: 5,
  rerankTopN: 15,
  maxResults: 7,
} as const;

// ============================================================
// Vector Search Class
// ============================================================

/**
 * Handles vector search operations for the chat agent.
 */
export class VectorSearchHandler {
  private embeddingService: EmbeddingService;
  private config: Required<VectorSearchConfig>;

  constructor(config?: VectorSearchConfig) {
    this.embeddingService = new EmbeddingService(env.OPENAI_API_KEY);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Performs hybrid search (vector + keyword) with ZeroEntropy reranking.
   * Uses Reciprocal Rank Fusion to combine semantic and lexical search.
   *
   * @param userId - User ID for filtering
   * @param noteId - Note ID for filtering
   * @param query - Search query
   * @param documentIds - Optional document IDs to filter to
   * @returns Array of search results
   */
  async search(
    userId: string,
    noteId: string,
    query: string,
    documentIds?: string[]
  ): Promise<ReferenceChunk[]> {
    // Validate document IDs if provided
    this.validateDocumentIds(documentIds);

    console.log(`[VectorSearch] query="${query}"`);
    console.log(
      `[VectorSearch] params: threshold=${this.config.vectorMatchThreshold}, count=${this.config.vectorMatchCount}`
    );

    const filterInfo =
      documentIds && documentIds.length > 0
        ? `filtering to ${documentIds.length} docs: ${documentIds.slice(0, 2).join(', ')}${documentIds.length > 2 ? '...' : ''}`
        : 'no document filter (all docs)';
    console.log(`[VectorSearch] docs: ${filterInfo}`);

    // Log chunk counts for debugging
    await this.logChunkCounts(userId, noteId, documentIds);

    // Generate embedding for the query
    const queryEmbedding = await this.embeddingService.embedText(query);

    // Execute hybrid search (vector + keyword with RRF)
    const results = await this.executeHybridSearch(
      queryEmbedding,
      query,
      userId,
      noteId,
      documentIds
    );

    // Deduplicate results
    const deduplicatedResults = this.deduplicateResults(results);
    console.log(`[VectorSearch] dedup: ${deduplicatedResults.length}`);

    // Rerank results
    const rerankedResults = await this.rerankResults(query, deduplicatedResults);

    // Limit to final results and reassign citation IDs
    const finalResults = rerankedResults
      .slice(0, this.config.maxResults)
      .map((result, index) => ({
        ...result,
        id: index + 1,
      }));

    console.log(`[VectorSearch] final: ${finalResults.length} results`);

    if (finalResults.length === 0) {
      const reason = results.length === 0 ? 'no matches above threshold' : 'all filtered by dedup/rerank';
      console.warn(`[VectorSearch] NO RESULTS: ${reason}`);
      throw new Error(
        `No results found in the ${documentIds?.length ?? 'all'} selected document(s). (${reason})`
      );
    }

    return finalResults as ReferenceChunk[];
  }

  /**
   * Validates document IDs are proper UUIDs.
   */
  private validateDocumentIds(documentIds?: string[]): void {
    if (documentIds && documentIds.length > 0) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const id of documentIds) {
        if (!uuidRegex.test(id)) {
          throw new Error(`Invalid document ID: ${id}`);
        }
      }
    }
  }

  /**
   * Logs chunk counts for debugging.
   */
  private async logChunkCounts(userId: string, noteId: string, documentIds?: string[]): Promise<void> {
    const { count: chunkCount } = await supabase
      .from('document_chunks')
      .select('document_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('notebook_id', noteId);
    console.log(`[VectorSearch] total chunks in DB: ${chunkCount ?? 0}`);

    const { count: chunksWithEmbeddings } = await supabase
      .from('document_chunks')
      .select('embedding', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('notebook_id', noteId)
      .not('embedding', 'is', null);
    console.log(`[VectorSearch] chunks with embeddings: ${chunksWithEmbeddings ?? 0}`);

    if (documentIds && documentIds.length > 0) {
      const { count: filteredChunkCount } = await supabase
        .from('document_chunks')
        .select('document_id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('notebook_id', noteId)
        .in('document_id', documentIds);
      console.log(`[VectorSearch] chunks in selected docs: ${filteredChunkCount ?? 0}`);

      const { count: filteredWithEmbeddings } = await supabase
        .from('document_chunks')
        .select('embedding', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('notebook_id', noteId)
        .in('document_id', documentIds)
        .not('embedding', 'is', null);
      console.log(`[VectorSearch] selected docs with embeddings: ${filteredWithEmbeddings ?? 0}`);
    }
  }

  /**
   * Executes hybrid search RPC call.
   */
  private async executeHybridSearch(
    queryEmbedding: number[],
    query: string,
    userId: string,
    noteId: string,
    documentIds?: string[]
  ): Promise<VectorSearchResult[]> {
    const { data, error } = await supabase.rpc('match_documents_hybrid', {
      query_embedding: queryEmbedding,
      query_text: query,
      user_id: userId,
      notebook_id: noteId,
      match_threshold: this.config.vectorMatchThreshold,
      match_count: this.config.vectorMatchCount,
      document_ids: documentIds && documentIds.length > 0 ? documentIds : null,
      rrf_k: 60, // Standard RRF constant
    });

    if (error) {
      console.error(`[VectorSearch] Hybrid search RPC failed: ${error.message}`);
      throw new Error(`Hybrid search failed: ${error.message}. Please check your embeddings.`);
    }

    // Diagnose filter issues if no results
    if (documentIds && documentIds.length > 0 && (!data || data.length === 0)) {
      await this.diagnoseFilterIssue(queryEmbedding, query, userId, noteId);
    }

    // Process results
    const allResults: VectorSearchResult[] = [];
    if (data && Array.isArray(data)) {
      for (const result of data as any[]) {
        allResults.push({
          id: 0, // Temporary ID, will be reassigned after deduplication
          sourceId: result.document_id,
          sourceTitle: result.title || result.file_name || 'Unknown Document',
          content: result.content,
          chunkIndex: result.chunk_index,
          similarity: result.similarity,
          rrfScore: result.rrf_score,
          vectorRank: result.vector_rank,
          keywordRank: result.keyword_rank,
        });
      }
    }

    // Log RPC result summary
    const topScores = allResults.slice(0, 3).map((r) => {
      const rrf = r.rrfScore?.toFixed(4) || 'N/A';
      const vRank = r.vectorRank || '-';
      const kRank = r.keywordRank || '-';
      return `RRF:${rrf}(v:${vRank},k:${kRank})`;
    });
    console.log(`[VectorSearch] Hybrid search returned: ${allResults.length} results`);
    console.log(`[VectorSearch] Top 3 scores: [${topScores.join(', ') || 'none'}]`);

    return allResults;
  }

  /**
   * Diagnoses if document filter is blocking results.
   */
  private async diagnoseFilterIssue(
    queryEmbedding: number[],
    query: string,
    userId: string,
    noteId: string
  ): Promise<void> {
    console.warn(`[VectorSearch] No results with filter, trying WITHOUT filter for diagnosis...`);

    const { data: dataNoFilter, error: errorNoFilter } = await supabase.rpc('match_documents_hybrid', {
      query_embedding: queryEmbedding,
      query_text: query,
      user_id: userId,
      notebook_id: noteId,
      match_threshold: this.config.vectorMatchThreshold,
      match_count: this.config.vectorMatchCount,
      document_ids: null,
      rrf_k: 60,
    });
    const noFilterCount = dataNoFilter?.length ?? 0;
    console.warn(`[VectorSearch] WITHOUT filter: ${noFilterCount} results`);
    if (noFilterCount > 0) {
      console.warn(`[VectorSearch] ISSUE: document_ids filter is blocking results!`);
    }
  }

  /**
   * Reranks results using ZeroEntropy zerank with retry logic for rate limits.
   */
  private async rerankResults(query: string, results: VectorSearchResult[]): Promise<VectorSearchResult[]> {
    // Skip reranking if not enough results or no API key
    if (!env.ZEROENTROPY_API_KEY || results.length <= this.config.rerankThreshold) {
      console.log(`[VectorSearch] Skipping reranking: only ${results.length} results`);
      return results;
    }

    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { ZeroEntropy } = await import('zeroentropy');
        const zclient = new ZeroEntropy({ apiKey: env.ZEROENTROPY_API_KEY });

        const documents = results.map((r) => r.content);

        console.log(`[VectorSearch] Reranking attempt ${attempt + 1}/${maxRetries}...`);
        const response = await zclient.models.rerank({
          model: env.ZEROENTROPY_RERANK_MODEL,
          query,
          documents,
          top_n: this.config.rerankTopN,
        });

        // Map reranked results back to original results
        const resultMap = new Map(results.map((r) => [r.content, r]));
        const rerankedResults: VectorSearchResult[] = [];
        const seen = new Set<VectorSearchResult>();

        if (response.results) {
          for (const item of response.results) {
            const original = resultMap.get((item as any).text || (item as any).document);
            if (original && !seen.has(original)) {
              rerankedResults.push(original);
              seen.add(original);
            }
          }
        }

        // Add any results that weren't reranked (preserving original order)
        for (const result of results) {
          if (!seen.has(result)) {
            rerankedResults.push(result);
            seen.add(result);
          }
        }

        console.log(`[VectorSearch] Successfully reranked ${rerankedResults.length} documents`);
        return rerankedResults;
      } catch (error: any) {
        const isRateLimitError = error?.statusCode === 429 || error?.status === 429;
        const isLastAttempt = attempt === maxRetries - 1;

        if (isRateLimitError && !isLastAttempt) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.warn(
            `[VectorSearch] Rate limit hit (429), retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        console.error(`[VectorSearch] Reranking failed after ${attempt + 1} attempt(s):`, {
          message: error?.message,
          status: error?.statusCode || error?.status,
          isRateLimit: isRateLimitError,
        });

        // Fall back to original order
        console.log(`[VectorSearch] Falling back to hybrid search (RRF) order`);
        return results;
      }
    }

    console.log(`[VectorSearch] Exhausted retries, using original order`);
    return results;
  }

  /**
   * Removes exact and near-duplicate chunks using diversity checks.
   * Prevents adjacent chunks from same document from dominating results.
   */
  private deduplicateResults(results: VectorSearchResult[]): VectorSearchResult[] {
    const seen = new Set<string>();
    const diverse: VectorSearchResult[] = [];

    for (const result of results) {
      const key = `${result.sourceId}-${result.chunkIndex}`;

      // Check exact duplicates
      if (seen.has(key)) continue;
      seen.add(key);

      // Check for adjacent chunks from same document (likely near-duplicates)
      const adjacentChunk = diverse.find(
        (existing) =>
          existing.sourceId === result.sourceId &&
          Math.abs(existing.chunkIndex - result.chunkIndex) === 1
      );

      if (adjacentChunk) {
        // Compare RRF scores - only replace if significantly better (>20% improvement)
        const currentScore = result.rrfScore || 0;
        const existingScore = adjacentChunk.rrfScore || 0;

        if (currentScore > existingScore * 1.2) {
          const index = diverse.indexOf(adjacentChunk);
          diverse.splice(index, 1, result);
        }
        continue;
      }

      diverse.push(result);
    }

    console.log(
      `[VectorSearch] Deduplication: ${results.length} → ${diverse.length} (removed ${results.length - diverse.length} near-duplicates)`
    );
    return diverse;
  }
}

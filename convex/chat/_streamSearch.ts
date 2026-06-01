"use node";

import type { HybridSearchConfig, KeywordSearchRunner } from "../_agents/chat/hybrid_search.js";
import { HybridSearchHandler } from "../_agents/chat/hybrid_search.js";
import { cachedRerank, RerankDocument } from "../_agents/chat/rerankCache.js";
import type { RerankFunction, VectorSearchRunner } from "../_agents/chat/vector_search.js";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { env } from "../_lib/env";
import type { ServiceLogger } from "../_lib/logging/serviceLogger";
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";
import type { ChunkMetadata } from "../storage/ChatHistoryService";

type DocumentChunkDoc = Doc<"documentChunks">;
type VectorSearchHit = { _id: Id<"documentChunks">; _score: number };

/** Vector match threshold for filtering in vectorSearchRunner. */
export const VECTOR_MATCH_THRESHOLD = 0.4;
const SELECTED_DOC_THRESHOLD_FACTOR = 0.7;
const LAST_RESORT_THRESHOLD_FACTOR = 0.5;

export interface ChatVectorSearchResult {
  _id: Id<"documentChunks">;
  _score: number;
  documentId: Id<"documents">;
  notebookId: Id<"notebooks">;
  chunkIndex: number;
  content: string;
  embedding: number[];
  sourceTitle: string;
  sourceUrl?: string;
  metadata?: ChunkMetadata;
}

export interface ResearchVectorSearchResult {
  sourceId: string;
  documentId: string;
  sourceTitle: string;
  sourceUrl?: string;
  content: string;
  chunkIndex: number;
  similarity: number;
}

export function loadHybridSearchConfig(): HybridSearchConfig {
  return {
    vectorMatchThreshold: parseFloat(env.CHAT_VECTOR_MATCH_THRESHOLD),
    vectorMatchCount: parseInt(env.CHAT_VECTOR_MATCH_COUNT, 10),
    rerankThreshold: parseInt(env.CHAT_RERANK_THRESHOLD, 10),
    rerankTopN: parseInt(env.CHAT_RERANK_TOP_N, 10),
    maxResults: parseInt(env.CHAT_MAX_RESULTS, 10),
    keywordMatchCount: parseInt(env.CHAT_KEYWORD_MATCH_COUNT, 10),
    rrfK: parseInt(env.CHAT_RRF_K, 10),
    enableHybrid: env.CHAT_ENABLE_HYBRID_SEARCH !== "false",
    hybridThreshold: parseFloat(env.CHAT_HYBRID_THRESHOLD),
  };
}

export function createKeywordSearchRunner(
  ctx: ActionCtx,
  notebookId: Id<"notebooks">,
  userId: Id<"users">,
  { quietLogs }: { quietLogs?: boolean } = {}
): KeywordSearchRunner {
  return async (query, limit, docIds) => {
    return ctx.runQuery(internal.documents.internal.keywordSearch, {
      notebookId,
      userId,
      query,
      limit,
      documentIds: docIds as any,
      quietLogs,
    });
  };
}

export function createRerankFn(ctx: ActionCtx): RerankFunction {
  return async (query, documents) => {
    return cachedRerank(ctx, query, documents as RerankDocument[], "zerank-2", 15);
  };
}

export function createChatVectorSearchRunner(
  ctx: ActionCtx,
  notebookId: Id<"notebooks">,
  log?: ServiceLogger
): VectorSearchRunner {
  return async (
    embedding: number[],
    limit: number,
    docIds?: string[]
  ): Promise<ChatVectorSearchResult[]> => {
    const limitToFetch = docIds?.length ? Math.max(limit * 3, 75) : limit;

    const results = await ctx.vectorSearch("documentChunks", "by_embedding", {
      vector: embedding,
      limit: limitToFetch,
      // Convex vector search filter typing is generated from the index schema;
      // using explicit any to avoid brittle type coupling.
      filter: (q: any) => q.eq("notebookId", notebookId),
    });

    log?.debug("vector_search_raw", { count: results.length });

    const chunkIds = (results as VectorSearchHit[]).map((r: VectorSearchHit) => r._id);
    const fullChunks =
      chunkIds.length > 0
        ? await ctx.runQuery(internal.documents.chunks.getChunks, { chunkIds })
        : [];

    const chunkMap = new Map<Id<"documentChunks">, DocumentChunkDoc>(
      (fullChunks as (DocumentChunkDoc | null)[])
        .filter((c: DocumentChunkDoc | null): c is DocumentChunkDoc => c !== null)
        .map((c: DocumentChunkDoc) => [c._id, c] as [Id<"documentChunks">, DocumentChunkDoc])
    );

    const rowsWithoutTitle: Array<{
      _id: Id<"documentChunks">;
      _score: number;
      documentId: Id<"documents">;
      notebookId: Id<"notebooks">;
      chunkIndex: number;
      content: string;
      embedding: number[];
      metadata?: ChunkMetadata;
    }> = [];

    for (const r of results as VectorSearchHit[]) {
      const chunk = chunkMap.get(r._id);
      if (!chunk) continue;

      rowsWithoutTitle.push({
        _id: r._id,
        _score: r._score ?? 0,
        documentId: chunk.documentId,
        notebookId: chunk.notebookId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding: chunk.embedding ?? [],
        metadata: {
          totalChunks: chunk.totalChunks ?? undefined,
          relativePosition: chunk.relativePosition ?? undefined,
          chunkLengthChars: chunk.chunkLengthChars ?? undefined,
          wordCount: chunk.wordCount ?? undefined,
          sentenceCount: chunk.sentenceCount ?? undefined,
          pageNumber: chunk.pageNumber ?? undefined,
          sectionTitle: chunk.sectionTitle ?? undefined,
          sectionLevel: chunk.sectionLevel ?? undefined,
          headingPath: chunk.headingPath ?? undefined,
          previousChunkPreview: chunk.previousChunkPreview ?? undefined,
          nextChunkPreview: chunk.nextChunkPreview ?? undefined,
          hasCodeBlock: chunk.hasCodeBlock ?? undefined,
          hasMathNotation: chunk.hasMathNotation ?? undefined,
          hasTable: chunk.hasTable ?? undefined,
          hasBulletList: chunk.hasBulletList ?? undefined,
          hasNumberedList: chunk.hasNumberedList ?? undefined,
        },
      });
    }

    const documentIds = [...new Set(rowsWithoutTitle.map((r) => r.documentId))];
    const docRows = (await ctx.runQuery(internal.documents.internal.getDocumentsByIds, {
      documentIds,
    })) as {
      _id: Id<"documents">;
      fileName: string;
      fileUrl?: string;
      fileType?: string;
    }[];
    const titleMap = new Map<Id<"documents">, string>(docRows.map((d) => [d._id, d.fileName]));
    const sourceUrlMap = new Map<Id<"documents">, string>();
    for (const d of docRows) {
      const u = d.fileUrl?.trim();
      if (!u) continue;
      if (d.fileType === "url" || d.fileType === "youtube") {
        sourceUrlMap.set(d._id, u);
      }
    }

    const rows: ChatVectorSearchResult[] = rowsWithoutTitle.map((r) => ({
      ...r,
      sourceTitle: (titleMap.get(r.documentId) ?? "Document") as string,
      sourceUrl: sourceUrlMap.get(r.documentId),
    }));

    // Apply documentIds filter FIRST, then threshold
    if (docIds && docIds.length > 0) {
      const docIdSet = new Set(docIds);
      const selectedDocResults = rows.filter((r) => docIdSet.has(r.documentId));
      log?.debug("vector_selected_docs", {
        chunks: selectedDocResults.length,
        sources: docIds.length,
      });

      if (selectedDocResults.length === 0) {
        log?.warn("No chunks in selected documents", { sources: docIds.length });
        return [];
      }

      const SELECTED_DOC_THRESHOLD = VECTOR_MATCH_THRESHOLD * SELECTED_DOC_THRESHOLD_FACTOR;
      let thresholded = selectedDocResults.filter((r) => r._score >= SELECTED_DOC_THRESHOLD);
      log?.debug("vector_after_threshold", {
        threshold: SELECTED_DOC_THRESHOLD,
        count: thresholded.length,
      });

      if (thresholded.length === 0) {
        const LAST_RESORT_THRESHOLD = VECTOR_MATCH_THRESHOLD * LAST_RESORT_THRESHOLD_FACTOR;
        thresholded = selectedDocResults.filter((r) => r._score >= LAST_RESORT_THRESHOLD);
        log?.warn("vector_threshold_fallback", {
          tried: SELECTED_DOC_THRESHOLD,
          lastResort: LAST_RESORT_THRESHOLD,
          count: thresholded.length,
        });
      }

      if (thresholded.length === 0) {
        log?.warn("vector_last_resort_top_k", {
          take: Math.min(limit, selectedDocResults.length),
        });
        thresholded = selectedDocResults.slice(0, Math.min(limit, selectedDocResults.length));
      }

      return thresholded.slice(0, limit);
    } else if (docIds && docIds.length === 0) {
      log?.debug("vector_no_sources_selected", {});
      return [];
    } else {
      log?.debug("vector_threshold_apply", { threshold: VECTOR_MATCH_THRESHOLD });
      let thresholded = rows.filter((r) => r._score >= VECTOR_MATCH_THRESHOLD);
      log?.debug("vector_after_threshold_global", {
        threshold: VECTOR_MATCH_THRESHOLD,
        count: thresholded.length,
        from: rows.length,
      });

      if (rows.length > 0) {
        const scores = rows.map((r) => r._score);
        log?.debug("vector_score_distribution", {
          min: Math.min(...scores),
          max: Math.max(...scores),
          avg: scores.reduce((a, b) => a + b, 0) / scores.length,
        });
      }

      if (thresholded.length === 0 && rows.length > 0) {
        const FALLBACK_THRESHOLDS = [0.35, 0.3, 0.25, 0.2];
        for (const fallbackThreshold of FALLBACK_THRESHOLDS) {
          thresholded = rows.filter((r) => r._score >= fallbackThreshold);
          if (thresholded.length > 0) {
            log?.warn("vector_fallback_threshold", {
              original: VECTOR_MATCH_THRESHOLD,
              fallbackThreshold,
              count: thresholded.length,
            });
            break;
          }
        }
        if (thresholded.length === 0) {
          log?.warn("vector_last_resort_unfiltered", {
            take: Math.min(limit, rows.length),
          });
          thresholded = rows.slice(0, Math.min(limit, rows.length));
        }
      }

      return thresholded.slice(0, limit);
    }
  };
}

export function createResearchVectorSearchRunner(ctx: ActionCtx, notebookId: Id<"notebooks">) {
  return async (embedding: number[], limit: number, docIds?: string[]) => {
    const limitToFetch = docIds?.length ? Math.max(limit * 3, 75) : limit;
    const vectorResults = await ctx.vectorSearch("documentChunks", "by_embedding", {
      vector: embedding,
      limit: limitToFetch,
      filter: (q: any) => q.eq("notebookId", notebookId),
    });

    const chunkIds = vectorResults.map((r) => r._id);
    if (chunkIds.length === 0) return [];
    const fullChunks = await ctx.runQuery(internal.documents.chunks.getChunks, { chunkIds });

    const chunkMap = new Map(fullChunks.filter(Boolean).map((c: any) => [c._id, c]));

    const docIds_unique = [
      ...new Set(vectorResults.map((r: any) => chunkMap.get(r._id)?.documentId).filter(Boolean)),
    ];
    const docRows = await ctx.runQuery(internal.documents.internal.getDocumentsByIds, {
      documentIds: docIds_unique as any,
    });
    const titleMap = new Map(docRows.map((d) => [d._id, d.fileName]));
    const sourceUrlMap = new Map<string, string>();
    for (const d of docRows) {
      if (d.fileUrl?.trim() && (d.fileType === "url" || d.fileType === "youtube")) {
        sourceUrlMap.set(d._id, d.fileUrl);
      }
    }

    return vectorResults
      .map((r) => {
        const chunk = chunkMap.get(r._id);
        if (!chunk) return null;
        return {
          sourceId: String(r._id),
          documentId: String(chunk.documentId),
          sourceTitle: titleMap.get(chunk.documentId) ?? "Document",
          sourceUrl: sourceUrlMap.get(String(chunk.documentId)),
          content: chunk.content as string,
          chunkIndex: chunk.chunkIndex as number,
          similarity: r._score ?? 0,
        };
      })
      .filter((x) => x !== null) as ResearchVectorSearchResult[];
  };
}

export function createHybridSearch(
  config: HybridSearchConfig,
  embeddingService: EmbeddingService,
  vectorSearchRunner: VectorSearchRunner,
  keywordSearchRunner: KeywordSearchRunner,
  rerankFn: RerankFunction
): HybridSearchHandler {
  return new HybridSearchHandler(
    config,
    embeddingService,
    vectorSearchRunner,
    keywordSearchRunner,
    rerankFn
  );
}

"use node";

import { internal } from "../../_generated/api";
import { Id, Doc } from "../../_generated/dataModel";
import type { ChunkMetadata } from "../../storage/ChatHistoryService";

export interface VectorSearchResult {
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

export const VECTOR_MATCH_THRESHOLD = 0.4;

type DocumentChunkDoc = Doc<"documentChunks">;
type VectorSearchHit = { _id: Id<"documentChunks">; _score: number };

export function buildVectorSearchRunner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  notebookIdTyped: Id<"notebooks">,
  chatStreamLog?: { debug: (key: string, meta?: Record<string, unknown>) => void; warn: (key: string, meta?: Record<string, unknown>) => void }
) {
  return async (
    embedding: number[],
    limit: number,
    docIds?: string[]
  ): Promise<VectorSearchResult[]> => {
    const limitToFetch = docIds?.length ? Math.max(limit * 3, 75) : limit;

    const results = await ctx.vectorSearch("documentChunks", "by_embedding", {
      vector: embedding,
      limit: limitToFetch,
      filter: (q: { eq: (field: "notebookId", value: Id<"notebooks">) => unknown }) =>
        q.eq("notebookId", notebookIdTyped),
    });

    chatStreamLog?.debug("vector_search_raw", { count: results.length });

    const chunkIds = (results as VectorSearchHit[]).map((r: VectorSearchHit) => r._id);
    const fullChunks =
      chunkIds.length > 0
        ? await ctx.runQuery(internal.documents.index.getChunks, { chunkIds })
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
    const docRows = (await ctx.runQuery(internal.documents.index.getDocumentsByIds, {
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

    const rows: VectorSearchResult[] = rowsWithoutTitle.map((r) => ({
      ...r,
      sourceTitle: (titleMap.get(r.documentId) ?? "Document") as string,
      sourceUrl: sourceUrlMap.get(r.documentId),
    }));

    if (docIds && docIds.length > 0) {
      const docIdSet = new Set(docIds);
      const selectedDocResults = rows.filter((r) => docIdSet.has(r.documentId));
      chatStreamLog?.debug("vector_selected_docs", {
        chunks: selectedDocResults.length,
        sources: docIds.length,
      });

      if (selectedDocResults.length === 0) {
        chatStreamLog?.warn("No chunks in selected documents", { sources: docIds.length });
        return [];
      }

      const SELECTED_DOC_THRESHOLD = VECTOR_MATCH_THRESHOLD * 0.7;
      let thresholded = selectedDocResults.filter((r) => r._score >= SELECTED_DOC_THRESHOLD);
      chatStreamLog?.debug("vector_after_threshold", {
        threshold: SELECTED_DOC_THRESHOLD,
        count: thresholded.length,
      });

      if (thresholded.length === 0) {
        const LAST_RESORT_THRESHOLD = VECTOR_MATCH_THRESHOLD * 0.5;
        thresholded = selectedDocResults.filter((r) => r._score >= LAST_RESORT_THRESHOLD);
        chatStreamLog?.warn("vector_threshold_fallback", {
          tried: SELECTED_DOC_THRESHOLD,
          lastResort: LAST_RESORT_THRESHOLD,
          count: thresholded.length,
        });
      }

      if (thresholded.length === 0) {
        chatStreamLog?.warn("vector_last_resort_top_k", {
          take: Math.min(limit, selectedDocResults.length),
        });
        thresholded = selectedDocResults.slice(0, Math.min(limit, selectedDocResults.length));
      }

      return thresholded.slice(0, limit);
    } else if (docIds && docIds.length === 0) {
      chatStreamLog?.debug("vector_no_sources_selected", {});
      return [];
    } else {
      chatStreamLog?.debug("vector_threshold_apply", { threshold: VECTOR_MATCH_THRESHOLD });
      let thresholded = rows.filter((r) => r._score >= VECTOR_MATCH_THRESHOLD);
      chatStreamLog?.debug("vector_after_threshold_global", {
        threshold: VECTOR_MATCH_THRESHOLD,
        count: thresholded.length,
        from: rows.length,
      });

      if (rows.length > 0) {
        const scores = rows.map((r) => r._score);
        chatStreamLog?.debug("vector_score_distribution", {
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
            chatStreamLog?.warn("vector_fallback_threshold", {
              original: VECTOR_MATCH_THRESHOLD,
              fallbackThreshold,
              count: thresholded.length,
            });
            break;
          }
        }
        if (thresholded.length === 0) {
          chatStreamLog?.warn("vector_last_resort_unfiltered", {
            take: Math.min(limit, rows.length),
          });
          thresholded = rows.slice(0, Math.min(limit, rows.length));
        }
      }

      return thresholded.slice(0, limit);
    }
  };
}

export function buildKeywordSearchRunner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  notebookIdTyped: Id<"notebooks">,
  keywordSearchChunkUserId: Id<"users">,
  chatStreamLog?: { debug: (key: string, meta?: Record<string, unknown>) => void }
) {
  return async (query: string, limit: number, docIds?: string[]) => {
    chatStreamLog?.debug("keyword_search_runner", { phase: "start" });

    const results = await ctx.runQuery(internal.documents.index.keywordSearch, {
      notebookId: notebookIdTyped,
      userId: keywordSearchChunkUserId,
      query,
      limit,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      documentIds: docIds as any,
    });

    chatStreamLog?.debug("keyword_search_runner", { returned: results.length });
    return results;
  };
}

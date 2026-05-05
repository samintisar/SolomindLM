import { v } from "convex/values";
import { internalQuery, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { createServiceLogger } from "../_lib/logging/serviceLogger";

/**
 * Internal: Keyword search using full-text search index
 */
export const keywordSearch = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
    userId: v.id("users"), // Note: Using v.id("users") from Better Auth
    query: v.string(),
    limit: v.optional(v.number()),
    documentIds: v.optional(v.array(v.id("documents"))),
    /** When true, skip structured logs (deep research issues many keyword calls). */
    quietLogs: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const results = await ctx.db
      .query("documentChunks")
      .withSearchIndex("search_content", (q) =>
        q.search("content", args.query).eq("userId", args.userId).eq("notebookId", args.notebookId)
      )
      .take(limit);

    // User explicitly has no selected sources - return empty results
    if (args.documentIds && args.documentIds.length === 0) {
      return [];
    }

    // FIXED: Explicit length > 0 check
    let filtered = results;
    if (args.documentIds && args.documentIds.length > 0) {
      const docIdSet = new Set(args.documentIds.map((id) => id.toString()));
      filtered = results.filter(
        (r) => r.documentId !== undefined && docIdSet.has(r.documentId.toString())
      );
    }

    if (!args.quietLogs) {
      const log = createServiceLogger("documents", "keywordSearch", {
        userId: args.userId,
        notebookId: args.notebookId,
      });
      log.debug("query", {
        preview: args.query.slice(0, 120),
        raw: results.length,
        afterFilter: filtered.length,
        filteredByDocs: !!(args.documentIds && args.documentIds.length > 0),
      });
    }

    const uniqueDocIds = [...new Set(filtered.map((r) => r.documentId))];
    type DocId = NonNullable<(typeof filtered)[0]["documentId"]>;
    const docMetaMap = new Map<DocId, { fileName: string; sourceUrl?: string }>();
    for (const id of uniqueDocIds) {
      const doc = await ctx.db.get(id);
      const fileName = doc?.fileName ?? "Document";
      const u = doc?.fileUrl?.trim();
      const sourceUrl =
        u &&
        (doc?.fileType === "url" || doc?.fileType === "youtube" || doc?.fileType === "paper_record")
          ? u
          : undefined;
      docMetaMap.set(id, { fileName, sourceUrl });
    }

    return filtered.map((r) => {
      const meta = r.documentId ? docMetaMap.get(r.documentId) : undefined;
      return {
        _id: r._id,
        _score: 0,
        content: r.content,
        chunkIndex: r.chunkIndex,
        documentId: r.documentId,
        sourceTitle: meta?.fileName ?? "Document",
        sourceUrl: meta?.sourceUrl,
        // Include chunk metadata for enhanced RAG context
        metadata: {
          totalChunks: r.totalChunks,
          relativePosition: r.relativePosition,
          chunkLengthChars: r.chunkLengthChars,
          wordCount: r.wordCount,
          sentenceCount: r.sentenceCount,
          pageNumber: r.pageNumber,
          sectionTitle: r.sectionTitle,
          sectionLevel: r.sectionLevel,
          headingPath: r.headingPath,
          previousChunkPreview: r.previousChunkPreview,
          nextChunkPreview: r.nextChunkPreview,
          hasCodeBlock: r.hasCodeBlock,
          hasMathNotation: r.hasMathNotation,
          hasTable: r.hasTable,
          hasBulletList: r.hasBulletList,
          hasNumberedList: r.hasNumberedList,
        },
      };
    });
  },
});

/**
 * Internal: Fetch chunks for documents (for use in agents)
 * This combines vector search with full chunk retrieval
 */
export const fetchChunks = internalAction({
  args: {
    documentIds: v.array(v.id("documents")),
  },
  handler: async (ctx, args) => {
    "use node";

    // Get all chunks for the specified documents
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allChunks: any[] = [];

    for (const documentId of args.documentIds) {
      const chunks = await ctx.runQuery(internal.documents.index.listChunksByDocument, {
        documentId,
      });
      allChunks.push(...chunks);
    }

    // Sort by document and chunk index
    allChunks.sort((a, b) => {
      if (a.documentId !== b.documentId) {
        return a.documentId.localeCompare(b.documentId);
      }
      return a.chunkIndex - b.chunkIndex;
    });

    return allChunks;
  },
});

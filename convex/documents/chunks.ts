import { v } from "convex/values";
import {
  cosineSimilarity,
  documentTopicScores,
  selectTopicDocuments,
} from "../_agents/_shared/topicSourceFilter";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { createServiceLogger } from "../_lib/logging/serviceLogger";

/**
 * Internal: List chunks by document
 */
export const listChunksByDocument = internalQuery({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("asc")
      .collect();

    return chunks;
  },
});

/**
 * Internal: Get chunks by IDs
 */
export const getChunks = internalQuery({
  args: {
    chunkIds: v.array(v.id("documentChunks")),
  },
  handler: async (ctx, args) => {
    return await Promise.all(args.chunkIds.map((id) => ctx.db.get(id)));
  },
});

/**
 * Internal: List chunks by notebook (for debugging)
 */
export const listChunksByNotebook = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .collect();
    return chunks;
  },
});

/**
 * Narrow chunks to the sources that match `topic` (#288). Best-effort: if the topic cannot be
 * embedded, every source stays.
 */
async function filterChunksToTopic(
  ctx: ActionCtx,
  chunks: Doc<"documentChunks">[],
  topic: string,
  documentCount: number
): Promise<Doc<"documentChunks">[]> {
  const logger = createServiceLogger("documents", "fetchChunks.topicFilter");
  let topicEmbedding: number[];
  try {
    topicEmbedding = await ctx.runAction(
      internal._services.ai.embeddingClient.generateEmbeddingInternal,
      { text: topic }
    );
  } catch (error) {
    logger.warn("Topic embedding failed; keeping every source", {
      error: error instanceof Error ? error.message : String(error),
    });
    return chunks;
  }
  const scores = documentTopicScores(
    chunks.flatMap((c) =>
      c.embedding?.length
        ? [{ documentId: c.documentId, similarity: cosineSimilarity(topicEmbedding, c.embedding) }]
        : []
    )
  );
  if (scores.size === 0) return chunks;
  const { keep, dropped } = selectTopicDocuments(scores);
  logger.info("Topic source selection", {
    topic: topic.slice(0, 200),
    documentCount,
    kept: keep.length,
    dropped: dropped.length,
    scores: Object.fromEntries([...scores].map(([id, s]) => [id, Number(s.toFixed(3))])),
  });
  if (dropped.length === 0) return chunks;
  // A source with no embedded chunks has no score; it stays.
  const droppedIds = new Set(dropped);
  return chunks.filter((c) => !droppedIds.has(c.documentId));
}

/**
 * Internal: Fetch chunks for documents (for use in agents). With `topic`, sources that clearly do
 * not match it are left out; each returned chunk carries its documentId so callers can count the
 * sources that remain.
 */
export const fetchChunks = internalAction({
  args: {
    documentIds: v.array(v.id("documents")),
    /** The studio request's topic, focus or custom prompt. */
    topic: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Array<{ content: string; documentId: Id<"documents"> }>> => {
    // Get all chunks for the specified documents
    let allChunks: Doc<"documentChunks">[] = [];

    for (const documentId of args.documentIds) {
      const chunks = await ctx.runQuery(internal.documents.chunks.listChunksByDocument, {
        documentId,
      });
      allChunks.push(...chunks);
    }

    const topic = args.topic?.trim();
    if (topic && args.documentIds.length > 1) {
      allChunks = await filterChunksToTopic(ctx, allChunks, topic, args.documentIds.length);
    }

    // Sort by document and chunk index
    allChunks.sort((a, b) => {
      if (a.documentId !== b.documentId) {
        return a.documentId.localeCompare(b.documentId);
      }
      return a.chunkIndex - b.chunkIndex;
    });

    // Callers only ever read `content` (see studio job phases). Stripping
    // the embedding vector (EMBEDDING_DIMENSIONS floats/chunk, see
    // convex/_lib/embeddingConfig.ts) and other chunk metadata before
    // returning keeps this action's serialized result well under Convex's
    // 16 MiB return-value limit for notebooks with many sources — the full
    // rows previously blew past that limit around ~30 sources.
    return allChunks.map((chunk) => ({ content: chunk.content, documentId: chunk.documentId }));
  },
});

/**
 * Internal: Store a document chunk with embedding and metadata
 */
export const storeChunk = internalMutation({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    content: v.string(),
    chunkIndex: v.number(),
    embedding: v.array(v.float64()),
    embeddingModel: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        totalChunks: v.optional(v.number()),
        relativePosition: v.optional(v.number()),
        chunkLengthChars: v.optional(v.number()),
        wordCount: v.optional(v.number()),
        sentenceCount: v.optional(v.number()),
        pageNumber: v.optional(v.number()),
        sectionTitle: v.optional(v.string()),
        sectionLevel: v.optional(v.number()),
        headingPath: v.optional(v.array(v.string())),
        previousChunkPreview: v.optional(v.string()),
        nextChunkPreview: v.optional(v.string()),
        hasCodeBlock: v.optional(v.boolean()),
        hasMathNotation: v.optional(v.boolean()),
        hasTable: v.optional(v.boolean()),
        hasBulletList: v.optional(v.boolean()),
        hasNumberedList: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const chunkData: any = {
      documentId: args.documentId,
      userId: args.userId,
      notebookId: args.notebookId,
      content: args.content,
      chunkIndex: args.chunkIndex,
      embedding: args.embedding,
      embeddingModel: args.embeddingModel,
      createdAt: Date.now(),
    };

    // Add metadata fields if provided
    if (args.metadata) {
      chunkData.totalChunks = args.metadata.totalChunks;
      chunkData.relativePosition = args.metadata.relativePosition;
      chunkData.chunkLengthChars = args.metadata.chunkLengthChars;
      chunkData.wordCount = args.metadata.wordCount;
      chunkData.sentenceCount = args.metadata.sentenceCount;
      chunkData.pageNumber = args.metadata.pageNumber;
      chunkData.sectionTitle = args.metadata.sectionTitle;
      chunkData.sectionLevel = args.metadata.sectionLevel;
      chunkData.headingPath = args.metadata.headingPath;
      chunkData.previousChunkPreview = args.metadata.previousChunkPreview;
      chunkData.nextChunkPreview = args.metadata.nextChunkPreview;
      chunkData.hasCodeBlock = args.metadata.hasCodeBlock;
      chunkData.hasMathNotation = args.metadata.hasMathNotation;
      chunkData.hasTable = args.metadata.hasTable;
      chunkData.hasBulletList = args.metadata.hasBulletList;
      chunkData.hasNumberedList = args.metadata.hasNumberedList;
    }

    await ctx.db.insert("documentChunks", chunkData);
  },
});

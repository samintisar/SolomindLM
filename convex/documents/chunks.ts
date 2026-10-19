import { v } from "convex/values";
import { withoutReferenceLists } from "../_agents/_shared/referenceSections";
import {
  chunkTopicSimilarities,
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
 * Internal: Each document's opening chunk, without its embedding. Chunks are stored in order,
 * so the first by creation is chunk 0. Chat shows it so the model knows what a source is (#477).
 */
export const listOpeningChunks = internalQuery({
  args: {
    documentIds: v.array(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const chunks = await Promise.all(
      [...new Set(args.documentIds)].map((documentId) =>
        ctx.db
          .query("documentChunks")
          .withIndex("by_document", (q) => q.eq("documentId", documentId))
          .order("asc")
          .first()
      )
    );
    return chunks
      .filter((c): c is Doc<"documentChunks"> => c !== null)
      .map(({ embedding: _embedding, ...chunk }) => chunk);
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

/** The chunk fields Studio jobs read: no embedding, which is most of a chunk row's size. */
type ChunkText = Pick<
  Doc<"documentChunks">,
  "documentId" | "chunkIndex" | "content" | "sectionTitle"
>;

/** Internal: One document's chunks in order, without their embeddings. */
export const listChunkTexts = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args): Promise<ChunkText[]> => {
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("asc")
      .collect();
    return chunks.map(({ documentId, chunkIndex, content, sectionTitle }) => ({
      documentId,
      chunkIndex,
      content,
      ...(sectionTitle !== undefined ? { sectionTitle } : {}),
    }));
  },
});

/** Internal: How closely one document matches a topic embedding; null if none of its chunks has one. */
export const documentTopicScore = internalQuery({
  args: { documentId: v.id("documents"), topicEmbedding: v.array(v.float64()) },
  handler: async (ctx, args): Promise<number | null> => {
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    const scores = documentTopicScores(chunkTopicSimilarities(chunks, args.topicEmbedding));
    return scores.get(args.documentId) ?? null;
  },
});

/**
 * The sources that match `topic` (#288). Each source is scored in its own query, so the
 * embeddings never sit in this action's memory together (64 MB). Best-effort: if the topic cannot
 * be embedded, every source stays.
 */
async function documentsForTopic(
  ctx: ActionCtx,
  documentIds: Id<"documents">[],
  topic: string
): Promise<Id<"documents">[]> {
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
    return documentIds;
  }
  const scores = new Map<string, number>();
  for (const documentId of documentIds) {
    const score = await ctx.runQuery(internal.documents.chunks.documentTopicScore, {
      documentId,
      topicEmbedding,
    });
    if (score !== null) scores.set(documentId, score);
  }
  if (scores.size === 0) return documentIds;
  const { keep, dropped } = selectTopicDocuments(scores);
  // The request text is user content, so only its length is logged.
  logger.info("Topic source selection", {
    topicChars: topic.length,
    documentCount: documentIds.length,
    kept: keep.length,
    dropped: dropped.length,
    scores: Object.fromEntries([...scores].map(([id, s]) => [id, Number(s.toFixed(3))])),
  });
  if (dropped.length === 0) return documentIds;
  // A source with no embedded chunks has no score; it stays.
  const droppedIds = new Set(dropped);
  return documentIds.filter((id) => !droppedIds.has(id));
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
    /** Leave out each source's reference list (cited works read as entities of their own; #350). */
    excludeReferenceLists: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Array<{ content: string; documentId: Id<"documents"> }>> => {
    const topic = args.topic?.trim();
    const documentIds =
      topic && args.documentIds.length > 1
        ? await documentsForTopic(ctx, args.documentIds, topic)
        : args.documentIds;

    // Chunk text only: full rows with embeddings ran a 13-source notebook out of memory.
    let allChunks: ChunkText[] = [];
    for (const documentId of documentIds) {
      allChunks.push(
        ...(await ctx.runQuery(internal.documents.chunks.listChunkTexts, { documentId }))
      );
    }

    if (args.excludeReferenceLists) {
      const before = allChunks.length;
      allChunks = withoutReferenceLists(allChunks);
      createServiceLogger("documents", "fetchChunks").info("Left out reference lists", {
        documentCount: args.documentIds.length,
        chunksDropped: before - allChunks.length,
        chunksKept: allChunks.length,
      });
    }

    // Sort by document and chunk index
    allChunks.sort((a, b) => {
      if (a.documentId !== b.documentId) {
        return a.documentId.localeCompare(b.documentId);
      }
      return a.chunkIndex - b.chunkIndex;
    });

    // Callers only read `content` and `documentId`; returning just those keeps the result well
    // under Convex's 16 MiB return-value limit for notebooks with many sources.
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

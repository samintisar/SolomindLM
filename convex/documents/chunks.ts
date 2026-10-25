import { v } from "convex/values";
import { withoutReferenceLists } from "../_agents/_shared/referenceSections";
import {
  documentTopicScores,
  selectTopicDocuments,
  TOPIC_SOURCE_TOP_K,
} from "../_agents/_shared/topicSourceFilter";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction, internalQuery } from "../_generated/server";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { internalMutation } from "../functions";
import { isTruncatedStoredMarkdown } from "./storedMarkdown.helpers";

/**
 * Internal: A document's title, and its full text when the stored copy holds all of it. One row
 * read, where stitching chunks reads every chunk with its embedding (~13 KB each). `text` is null
 * for a legacy document without a stored copy, or one whose copy was truncated.
 */
export const getDocumentFullText = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    const stored = doc.extractedMarkdown?.trim();
    return {
      fileName: doc.fileName,
      text: stored && !isTruncatedStoredMarkdown(stored) ? stored : null,
    };
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
    const chunks = await Promise.all(args.chunkIds.map((id) => ctx.db.get(id)));
    // A deleted source's chunks are removed in scheduled batches; until then, skip them.
    const documentIds = [...new Set(chunks.flatMap((c) => (c ? [c.documentId] : [])))];
    const existing = new Set<string>();
    for (const id of documentIds) {
      if (await ctx.db.get(id)) existing.add(id);
    }
    return chunks.map((c) => (c && existing.has(c.documentId) ? c : null));
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

/**
 * Chunks read per query. A query reads whole rows, embedding included (~13 KB each), so one
 * large source read in a single query passes Convex's 16 MiB read limit; a page stays well under.
 */
export const CHUNK_PAGE_SIZE = 200;

const cursorValidator = v.union(v.string(), v.null());

type Page<T> = { page: T[]; isDone: boolean; continueCursor: string };

/** Every page `readPage` returns, from the first. */
async function readAllPages<T>(readPage: (cursor: string | null) => Promise<Page<T>>) {
  const all: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const { page, isDone, continueCursor }: Page<T> = await readPage(cursor);
    all.push(...page);
    if (isDone) return all;
    cursor = continueCursor;
  }
}

/** Internal: One page of a document's chunks in order, without their embeddings. */
export const listChunkTexts = internalQuery({
  args: { documentId: v.id("documents"), cursor: cursorValidator },
  handler: async (ctx, args): Promise<Page<ChunkText>> => {
    const result = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("asc")
      .paginate({ cursor: args.cursor, numItems: CHUNK_PAGE_SIZE });
    return {
      page: result.page.map(({ documentId, chunkIndex, content, sectionTitle }) => ({
        documentId,
        chunkIndex,
        content,
        ...(sectionTitle !== undefined ? { sectionTitle } : {}),
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * How closely one document matches a topic embedding; null if none of its chunks is indexed. The
 * vector index returns the best chunks' cosine scores without reading any chunk row.
 */
async function documentTopicScore(
  ctx: ActionCtx,
  documentId: Id<"documents">,
  topicEmbedding: number[]
): Promise<number | null> {
  const hits = await ctx.vectorSearch("documentChunks", "by_embedding", {
    vector: topicEmbedding,
    limit: TOPIC_SOURCE_TOP_K,
    filter: (q) => q.eq("documentId", documentId),
  });
  const similarities = hits.map((hit) => ({ documentId, similarity: hit._score }));
  return documentTopicScores(similarities).get(documentId) ?? null;
}

/** One document's chunks in order, without their embeddings. */
export async function documentChunkTexts(
  ctx: ActionCtx,
  documentId: Id<"documents">
): Promise<ChunkText[]> {
  return await readAllPages((cursor) =>
    ctx.runQuery(internal.documents.chunks.listChunkTexts, { documentId, cursor })
  );
}

/**
 * The sources that match `topic` (#288). Each source is scored by its own vector search, which
 * reads no chunk rows. Best-effort: if the topic cannot be embedded or a search fails, every
 * source stays.
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
  let documentScores: Array<number | null>;
  try {
    documentScores = await Promise.all(
      documentIds.map((documentId) => documentTopicScore(ctx, documentId, topicEmbedding))
    );
  } catch (error) {
    logger.warn("Topic vector search failed; keeping every source", {
      error: error instanceof Error ? error.message : String(error),
    });
    return documentIds;
  }
  const scores = new Map<string, number>();
  documentIds.forEach((documentId, i) => {
    const score = documentScores[i];
    if (score !== null) scores.set(documentId, score);
  });
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
    let allChunks: ChunkText[] = (
      await Promise.all(documentIds.map((documentId) => documentChunkTexts(ctx, documentId)))
    ).flat();

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

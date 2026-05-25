import { v } from "convex/values";
import { internalQuery, internalMutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

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
      const chunks = await ctx.runQuery(internal.documents.chunks.listChunksByDocument, {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunkData: any = {
      documentId: args.documentId,
      userId: args.userId,
      notebookId: args.notebookId,
      content: args.content,
      chunkIndex: args.chunkIndex,
      embedding: args.embedding,
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

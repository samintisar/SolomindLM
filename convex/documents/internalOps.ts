import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { deleteAllChunksForDocument } from "./_helpers";

/**
 * Internal: Update document status
 */
export const updateStatus = internalMutation({
  args: {
    documentId: v.id("documents"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update document title
 */
export const updateTitle = internalMutation({
  args: {
    documentId: v.id("documents"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      fileName: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: replace source URL (e.g. OpenAlex work page → DOI) before scrape / re-embed.
 */
export const setDocumentFileUrl = internalMutation({
  args: {
    documentId: v.id("documents"),
    fileUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      fileUrl: args.fileUrl,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Full extracted markdown for source viewer / copy (single string, no chunk overlap).
 */
export const setExtractedMarkdown = internalMutation({
  args: {
    documentId: v.id("documents"),
    extractedMarkdown: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      extractedMarkdown: args.extractedMarkdown,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update document-level metadata
 */
export const updateMetadata = internalMutation({
  args: {
    documentId: v.id("documents"),
    metadata: v.object({
      wordCount: v.optional(v.number()),
      estimatedReadingTimeMinutes: v.optional(v.number()),
      totalPages: v.optional(v.number()),
      totalChunks: v.optional(v.number()),
      hasCodeBlocks: v.optional(v.boolean()),
      hasMathNotation: v.optional(v.boolean()),
      hasTables: v.optional(v.boolean()),
      hasImages: v.optional(v.boolean()),
      language: v.optional(v.string()),
      documentStructure: v.optional(v.union(v.literal("flat"), v.literal("hierarchical"))),
      maxHeadingLevel: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      ...args.metadata,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Patch document with partial updates
 */
export const patch = internalMutation({
  args: {
    documentId: v.id("documents"),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      ...args.patch,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Clear chunks, optionally swap Convex storage blob, reset doc fields, schedule embedding.
 */
export const prepareDocumentReembed = internalMutation({
  args: {
    documentId: v.id("documents"),
    delayMs: v.number(),
    newStorageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");

    if (args.newStorageId !== undefined) {
      if (doc.storageId) {
        await ctx.storage.delete(doc.storageId as Id<"_storage">);
      }
      await ctx.db.patch(args.documentId, {
        storageId: args.newStorageId,
        updatedAt: Date.now(),
      });
    }

    await deleteAllChunksForDocument(ctx, args.documentId);

    const before = await ctx.db.get(args.documentId);
    await ctx.db.patch(args.documentId, {
      status: "pending",
      error: undefined,
      wordCount: undefined,
      estimatedReadingTimeMinutes: undefined,
      totalPages: undefined,
      totalChunks: undefined,
      hasCodeBlocks: undefined,
      hasMathNotation: undefined,
      hasTables: undefined,
      hasImages: undefined,
      language: undefined,
      documentStructure: undefined,
      maxHeadingLevel: undefined,
      metadata: undefined,
      extractedMarkdown: undefined,
      ...(before?.fileType === "paper_record" ? { ingestionStatus: "pending" as const } : {}),
      updatedAt: Date.now(),
    });

    const after = await ctx.db.get(args.documentId);
    if (!after) throw new Error("Document not found");

    await ctx.scheduler.runAfter(args.delayMs, internal.documents.embeddingJob.docEmbedding, {
      documentId: args.documentId,
      userId: after.userId,
      notebookId: after.notebookId,
    });
  },
});

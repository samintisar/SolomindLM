import { v } from "convex/values";
import { query, internalQuery, internalMutation } from "../_generated/server";
import { getAuthUserId } from "../auth";

/**
 * Internal: Get document for source guide generation
 */
export const getDocumentInternal = internalQuery({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document || document.userId !== args.userId) return null;
    return document;
  },
});

/**
 * Internal: Get document chunks for source guide generation
 */
export const getDocumentChunksInternal = internalQuery({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("asc")
      .take(100);
    return chunks.filter((c) => c.userId === args.userId);
  },
});

/**
 * Get source guide for a document
 */
export const getSourceGuide = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const document = await ctx.db.get(args.documentId);
    if (!document || document.userId !== userId) return null;

    if (document.sourceGuide) {
      return {
        summary: document.sourceGuide.summary,
        topics: document.sourceGuide.topics,
        isGenerating: false,
      };
    }

    // Signal that generation should start
    if (document.status === "completed") {
      return { summary: null, topics: null, isGenerating: true };
    }

    return { summary: null, topics: null, isGenerating: false };
  },
});

/**
 * Internal: Set source guide for a document
 */
export const setSourceGuide = internalMutation({
  args: {
    documentId: v.id("documents"),
    summary: v.string(),
    topics: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) return;

    // Idempotent: skip if already set
    if (document.sourceGuide) return;

    await ctx.db.patch(args.documentId, {
      sourceGuide: {
        summary: args.summary,
        topics: args.topics,
        generatedAt: Date.now(),
      },
    });
  },
});

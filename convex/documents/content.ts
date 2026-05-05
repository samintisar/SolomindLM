import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getAuthUserId } from "../auth";
import { assertCanReadNotebook } from "../_lib/notebookAccess";

/**
 * Get document content for the source viewer (prefers full `extractedMarkdown`, else stitched chunks).
 */
export const getContent = query({
  args: { id: v.id("documents") },
  returns: v.union(
    v.null(),
    v.object({
      documentId: v.id("documents"),
      content: v.string(),
      chunkCount: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const document = await ctx.db.get(args.id);
    if (!document) {
      return null;
    }

    try {
      await assertCanReadNotebook(ctx, document.notebookId, userId);
    } catch {
      return null;
    }

    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();

    const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    const stored = document.extractedMarkdown?.trim();
    if (stored) {
      return {
        documentId: args.id,
        content: stored,
        chunkCount: sortedChunks.length,
      };
    }

    if (sortedChunks.length === 0) {
      throw new Error("Document content not found");
    }

    // Legacy: stitched chunks (overlapping); prefer re-ingesting for clean view
    const fullContent = sortedChunks.map((chunk) => chunk.content).join("\n");

    return {
      documentId: args.id,
      content: fullContent,
      chunkCount: sortedChunks.length,
    };
  },
});

/**
 * Get a signed URL for a document's storage file
 */
export const getSignedUrl = mutation({
  args: { storageId: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const document = await ctx.db
      .query("documents")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();

    if (!document) {
      throw new Error("Document not found");
    }

    await assertCanReadNotebook(ctx, document.notebookId, userId);

    return await ctx.storage.getUrl(args.storageId as Id<"_storage">);
  },
});

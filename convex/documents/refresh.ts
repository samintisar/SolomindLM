import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  assertCanReadNotebook,
  assertCanEditNotebook,
  getNotebookAccess,
} from "../_lib/notebookAccess";

/**
 * Internal: verify a user can resolve a file URL for this storage (document in a readable notebook).
 */
export const userCanAccessStorage = internalQuery({
  args: {
    userId: v.id("users"),
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!doc) return false;
    const access = await getNotebookAccess(ctx, doc.notebookId, args.userId);
    return access !== null;
  },
});

/**
 * Internal: List documents in a notebook when the user can read the notebook (for internal actions).
 */
export const listDocumentsForNotebookReadInternal = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await assertCanReadNotebook(ctx, args.notebookId, args.userId);
    return await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .order("desc")
      .collect();
  },
});

/**
 * Internal: Notebook documents for remote refresh (caller must pass authenticated user id).
 */
export const listDocumentsForNotebookRefresh = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await assertCanEditNotebook(ctx, args.notebookId, args.userId);
    return await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .collect();
  },
});

/**
 * Internal: Single document if the user can edit its notebook.
 */
export const getDocumentForRefresh = internalQuery({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    await assertCanEditNotebook(ctx, doc.notebookId, args.userId);
    return doc;
  },
});

/**
 * Internal: Get document details for job processing
 * Used by DocEmbeddingJob to fetch storage information
 */
export const getDocumentDetails = internalQuery({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) {
      throw new Error("Document not found");
    }
    return {
      storageId: doc.storageId,
      fileName: doc.fileName,
      fileType: doc.fileType,
      fileUrl: doc.fileUrl,
      paperRecord: doc.paperRecord,
      fulltextStatus: doc.fulltextStatus,
      ingestionStatus: doc.ingestionStatus,
    };
  },
});

/**
 * Internal: Get document titles by IDs (for chat reference tooltips)
 */
export const getDocumentsByIds = internalQuery({
  args: {
    documentIds: v.array(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const uniqueIds = [...new Set(args.documentIds)];
    return Promise.all(
      uniqueIds.map(async (id) => {
        const doc = await ctx.db.get(id);
        return {
          _id: id,
          fileName: doc?.fileName ?? "Document",
          fileUrl: doc?.fileUrl,
          fileType: doc?.fileType,
        };
      })
    );
  },
});

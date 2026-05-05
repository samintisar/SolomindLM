import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { getAuthUserId } from "../auth";
import { checkSourceLimit } from "../_lib/limits";
import { MAX_USER_WIDE_DOCUMENTS } from "../_lib/queryCaps";
import {
  assertCanEditNotebook,
  assertCanReadNotebook,
} from "../_lib/notebookAccess";
import { deleteAllChunksForDocument, FILE_EXTENSIONS } from "./_helpers";
import { paperRecordValidator, primaryLinkUrlForPaper, deriveFulltextStatus } from "./paperRecord";

/**
 * Get a presigned URL for uploading a file to Convex Storage
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Upload a document (file, URL, YouTube, or text)
 */
export const upload = mutation({
  args: {
    notebookId: v.id("notebooks"),
    type: v.string(),
    source: v.optional(v.string()),
    storageId: v.optional(v.string()),
    fileName: v.string(),
    fileSize: v.optional(v.number()),
    contentType: v.optional(v.string()), // e.g. application/pdf — used when fileName has no extension
    googleDriveFileId: v.optional(v.string()),
    googleDriveMimeType: v.optional(v.string()),
    paperRecord: v.optional(paperRecordValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    // Check source limit
    await checkSourceLimit(ctx, args.notebookId);

    // Validate type
    const validTypes = ["file", "url", "youtube", "text", "paper_record"];
    if (!validTypes.includes(args.type)) {
      throw new Error(`Invalid type. Must be one of: ${validTypes.join(", ")}`);
    }

    // Validate required fields based on type
    if (args.type === "file" && !args.storageId) {
      throw new Error("storageId is required for file uploads");
    }
    if ((args.type === "url" || args.type === "youtube" || args.type === "text") && !args.source) {
      throw new Error("source is required for url/youtube/text type");
    }
    if (args.type === "paper_record") {
      if (!args.paperRecord) {
        throw new Error("paperRecord is required for paper_record type");
      }
    }

    if (args.type === "file" && (args.googleDriveFileId || args.googleDriveMimeType)) {
      if (!args.googleDriveFileId || !args.googleDriveMimeType) {
        throw new Error(
          "googleDriveFileId and googleDriveMimeType must both be set for Drive-backed files"
        );
      }
    }

    const now = Date.now();

    let paperFields: {
      paperRecord: NonNullable<(typeof args)["paperRecord"]>;
      fulltextStatus: "available" | "unavailable" | "external_only";
      ingestionStatus: "pending";
      fileUrl: string | undefined;
    } | null = null;
    if (args.type === "paper_record" && args.paperRecord) {
      const pr = args.paperRecord;
      const link = primaryLinkUrlForPaper(pr);
      paperFields = {
        paperRecord: pr,
        fulltextStatus: deriveFulltextStatus(pr),
        ingestionStatus: "pending",
        fileUrl: link || undefined,
      };
    }

    const documentId = await ctx.db.insert("documents", {
      userId,
      notebookId: args.notebookId,
      fileName: args.fileName,
      fileType: args.type,
      fileSize: args.fileSize,
      storageId: args.storageId,
      contentType: args.contentType,
      googleDriveFileId: args.googleDriveFileId,
      googleDriveMimeType: args.googleDriveMimeType,
      fileUrl:
        args.type === "url" || args.type === "youtube" || args.type === "text"
          ? args.source
          : paperFields?.fileUrl,
      status: "pending",
      paperRecord: paperFields?.paperRecord,
      fulltextStatus: paperFields?.fulltextStatus,
      ingestionStatus: paperFields?.ingestionStatus,
      createdAt: now,
      updatedAt: now,
    });

    // Schedule embedding job; stagger YouTube jobs to avoid Supadata "Limit Exceeded" when uploading multiple at once
    const delayMs = args.type === "youtube" ? Math.floor(Math.random() * 8000) : 0;
    await ctx.scheduler.runAfter(delayMs, internal.documents.embeddingJob.docEmbedding, {
      documentId,
      userId,
      notebookId: args.notebookId,
    });

    return {
      documentId,
      status: "pending",
      message: "Document uploaded successfully",
    };
  },
});

/**
 * Get a document by ID
 */
export const get = query({
  args: { id: v.id("documents") },
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

    return document;
  },
});

/**
 * Get all documents for a notebook
 */
export const list = query({
  args: { notebookId: v.optional(v.id("notebooks")) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    if (args.notebookId) {
      await assertCanReadNotebook(ctx, args.notebookId, userId);

      return await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId!))
        .order("desc")
        .collect();
    }

    // User-wide list: cap to keep reads bounded (use notebook-scoped list for full set per notebook)
    return await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_USER_WIDE_DOCUMENTS);
  },
});

/**
 * Update a document title.
 * For file documents, preserves the existing extension if the new title doesn't include one,
 * so the source continues to display as PDF/DOCX etc. instead of falling back to DOC.
 */
export const update = mutation({
  args: {
    id: v.id("documents"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const { id, title } = args;

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Document not found");
    }

    await assertCanEditNotebook(ctx, existing.notebookId, userId);

    let newFileName = title.trim();

    if (existing.fileType === "file" && existing.fileName) {
      const lastDot = existing.fileName.lastIndexOf(".");
      const existingExt = lastDot >= 0 ? existing.fileName.slice(lastDot + 1).toLowerCase() : "";
      if (existingExt && FILE_EXTENSIONS.has(existingExt)) {
        const newLastDot = newFileName.lastIndexOf(".");
        const newExt = newLastDot >= 0 ? newFileName.slice(newLastDot + 1).toLowerCase() : "";
        if (!newExt || !FILE_EXTENSIONS.has(newExt)) {
          newFileName = newFileName + (newFileName.endsWith(".") ? "" : ".") + existingExt;
        }
      }
    }

    await ctx.db.patch(id, {
      fileName: newFileName,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

/**
 * Delete a document
 */
export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const document = await ctx.db.get(args.id);
    if (!document) {
      throw new Error("Document not found");
    }

    await assertCanEditNotebook(ctx, document.notebookId, userId);

    await deleteAllChunksForDocument(ctx, args.id);

    if (document.storageId) {
      await ctx.storage.delete(document.storageId as Id<"_storage">);
    }

    await ctx.db.delete(args.id);

    return { message: "Document deleted successfully" };
  },
});

/**
 * Delete multiple documents (same cleanup as remove).
 */
export const removeMany = mutation({
  args: { ids: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    if (args.ids.length === 0) {
      return { deleted: 0 };
    }

    let deleted = 0;
    for (const id of args.ids) {
      const document = await ctx.db.get(id);
      if (!document) continue;

      await assertCanEditNotebook(ctx, document.notebookId, userId);

      await deleteAllChunksForDocument(ctx, id);

      if (document.storageId) {
        await ctx.storage.delete(document.storageId as Id<"_storage">);
      }

      await ctx.db.delete(id);
      deleted += 1;
    }

    return { deleted };
  },
});

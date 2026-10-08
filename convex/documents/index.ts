import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "../_generated/server";
import { checkSourceLimit } from "../_lib/limits";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import {
  assertCanEditNotebook,
  assertCanReadNotebook,
  canReadNotebook,
  getNotebookAccess,
} from "../_lib/notebookAccess";
import { MAX_DOCUMENTS_PER_NOTEBOOK_LIST, MAX_USER_WIDE_DOCUMENTS } from "../_lib/queryCaps";
import { TEXT_TITLE_MAX_LENGTH } from "../_lib/textTitle";
import { getAuthUserId } from "../auth";
import { deleteAllChunksForDocument } from "./internal";
import { deriveFulltextStatus, paperRecordValidator, primaryLinkUrlForPaper } from "./paperRecord";

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
    // For pasted text, fileName is the title the user typed (the form caps it too).
    if (args.type === "text" && args.fileName.trim().length > TEXT_TITLE_MAX_LENGTH) {
      throw new Error(`Title must be ${TEXT_TITLE_MAX_LENGTH} characters or fewer`);
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
      const notebookId = args.notebookId;
      if (!(await canReadNotebook(ctx, notebookId, userId))) return [];

      return await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .order("desc")
        .take(MAX_DOCUMENTS_PER_NOTEBOOK_LIST);
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
      return null;
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

// Known file extensions so we can preserve them when renaming (keeps PDF/DOCX etc. labels correct)
const FILE_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "doc",
  "pptx",
  "ppt",
  "xlsx",
  "xls",
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "avif",
  "wav",
  "mp3",
  "m4a",
  "webm",
  "flac",
]);

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

/**
 * Internal: throws unless the user can add one more source to this notebook. Lets actions that
 * download a file first (Google Drive) refuse before storing anything.
 */
export const assertCanAddSourceInternal = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertCanEditNotebook(ctx, args.notebookId, args.userId);
    await checkSourceLimit(ctx, args.notebookId, { userId: args.userId });
    return null;
  },
});

/**
 * Add discovered external sources (from web/academic/news/finance search) to a notebook.
 * Creates document records and triggers embedding pipeline for each source.
 */
export const addExternalSources = mutation({
  args: {
    notebookId: v.id("notebooks"),
    sources: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        snippet: v.optional(v.string()),
        sourceType: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    const logger = createServiceLogger("documents", "addExternalSources", {
      userId,
      notebookId: args.notebookId,
    });

    logger.operationStart({ sourceCount: args.sources.length });

    const now = Date.now();
    const createdIds: Id<"documents">[] = [];

    // Deduplicate against the notebook (one scan, which also counts it for the limit) and
    // within the batch, then check the limit once.
    const seenUrls = new Set<string>();
    let existingCount = 0;
    for await (const doc of ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))) {
      existingCount += 1;
      if (doc.fileUrl) seenUrls.add(doc.fileUrl);
    }
    const newSources: typeof args.sources = [];
    for (const source of args.sources) {
      if (seenUrls.has(source.url)) {
        logger.info("skipped_duplicate_source", { url: source.url });
        continue;
      }
      seenUrls.add(source.url);
      newSources.push(source);
    }

    if (newSources.length > 0) {
      await checkSourceLimit(ctx, args.notebookId, {
        adding: newSources.length,
        existingCount,
      });
    }

    for (const source of newSources) {
      const documentId = await ctx.db.insert("documents", {
        userId,
        notebookId: args.notebookId,
        fileName: source.title,
        fileType: source.sourceType === "academic" ? "paper_record" : "url",
        fileUrl: source.url,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      createdIds.push(documentId);

      // Schedule embedding job for each document
      await ctx.scheduler.runAfter(0, internal.documents.embeddingJob.docEmbedding, {
        documentId,
        notebookId: args.notebookId,
        userId,
      });
    }

    logger.operationComplete({
      createdCount: createdIds.length,
      skippedCount: args.sources.length - createdIds.length,
    });

    return createdIds;
  },
});

// ── Source Guide (lazy-generated AI summary + topic chips) ──────────

/** The document when the user can read its notebook (owner or member), else null. */
async function getReadableDocument(
  ctx: QueryCtx,
  documentId: Id<"documents">,
  userId: Id<"users">
): Promise<Doc<"documents"> | null> {
  const document = await ctx.db.get(documentId);
  if (!document || !(await canReadNotebook(ctx, document.notebookId, userId))) return null;
  return document;
}

export const getDocumentInternal = internalQuery({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await getReadableDocument(ctx, args.documentId, args.userId);
  },
});

export const getDocumentChunksInternal = internalQuery({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (!(await getReadableDocument(ctx, args.documentId, args.userId))) return [];
    return await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("asc")
      .take(100);
  },
});

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

export { getExistingPapers } from "./getExistingPapers";
export { parseBibliography } from "./parseBibliography";
export { resolveDoi } from "./resolveDoi";
// Re-exports for paper import workflows
export { generateSourceGuide } from "./sourceGuide";

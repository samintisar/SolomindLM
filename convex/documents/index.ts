import { v } from "convex/values";
import {
  mutation,
  query,
  action,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getAuthUserId } from "../auth";
import { checkSourceLimit } from "../_lib/limits";
import { MAX_USER_WIDE_DOCUMENTS } from "../_lib/queryCaps";
import {
  assertCanEditNotebook,
  assertCanReadNotebook,
} from "../_lib/notebookAccess";
import { env } from "../_lib/env";
import { deriveFulltextStatus, paperRecordValidator, primaryLinkUrlForPaper } from "./paperRecord";
import { deleteAllChunksForDocument } from "./internal";

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

    const now = Date.now();
    const createdIds: Id<"documents">[] = [];

    for (const source of args.sources) {
      // Deduplicate: skip if URL already exists in this notebook
      const existing = await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
        .filter((q) => q.eq(q.field("fileUrl"), source.url))
        .first();

      if (existing) {
        continue;
      }

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

    return createdIds;
  },
});

/**
 * Generate a source guide (summary + topics) for a document using the fast LLM.
 * On-demand: called when user opens a document without a source guide.
 */
export const generateSourceGuide = action({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ summary: string; topics: string[]; generatedAt: number }> => {
    "use node";

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }

    const { documentId } = args;

    // Get document
    const document: {
      notebookId: Id<"notebooks">;
      extractedMarkdown: string | undefined;
      sourceGuide: { summary: string; topics: string[]; generatedAt: number } | undefined;
    } | null = await ctx.runQuery(internal.documents.internal.getDocumentDetails, {
      documentId,
    });

    if (!document) {
      throw new Error("Document not found");
    }

    const canRead = await ctx.runQuery(internal.notebooks.index.canReadNotebookInternal, {
      notebookId: document.notebookId,
      userId,
    });
    if (!canRead) {
      throw new Error("Unauthorized");
    }

    // Skip if already generated
    if (document.sourceGuide) {
      return document.sourceGuide;
    }

    if (!document.extractedMarkdown) {
      throw new Error("Document content not yet extracted");
    }

    // Truncate if too long (fast LLM has context limits)
    const MAX_CONTENT_CHARS = 150_000;
    let content = document.extractedMarkdown;
    if (content.length > MAX_CONTENT_CHARS) {
      content =
        content.slice(0, MAX_CONTENT_CHARS) + "\n\n[Content truncated for summary generation]";
    }

    // Call Together AI API directly (avoiding LangChain performance dependency)
    const apiKey = env.TOGETHER_AI_API_KEY;
    if (!apiKey) {
      throw new Error("TOGETHER_AI_API_KEY is not set");
    }

    const systemPrompt = `You are an expert document analyst. Generate a concise source guide for the provided document.

Your response must be a JSON object with exactly two fields:
- "summary": A 2-3 sentence summary of the document's key themes and purpose. Use bold (**text**) for important terms and concepts. Keep it informative but concise.
- "topics": An array of 4-8 key topics/tags covered in the document. Each should be a short phrase (1-4 words). Focus on the most important themes.

The summary should help users quickly understand what this source is about and how it relates to their research.
Respond ONLY with the JSON object, no other text.`;

    const userPrompt = `Analyze this document and generate a source guide:\n\n${content}`;

    const togetherResponse = await fetch("https://api.together.xyz/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: env.FAST_LLM,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
    });

    if (!togetherResponse.ok) {
      const errorText = await togetherResponse.text();
      throw new Error(`Together AI API error: ${togetherResponse.status} ${errorText}`);
    }

    const togetherData = await togetherResponse.json();
    const text = togetherData.choices?.[0]?.message?.content || "";

    // Parse the response
    let summary: string;
    let topics: string[];

    try {
      // Try to extract JSON if wrapped in markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
      const parsed = JSON.parse(jsonStr);
      summary = parsed.summary || "";
      topics = Array.isArray(parsed.topics) ? parsed.topics : [];
    } catch {
      // Fallback: use the raw text as summary, no topics
      summary = text.slice(0, 500);
      topics = [];
    }

    const sourceGuide = {
      summary,
      topics,
      generatedAt: Date.now(),
    };

    // Store in database
    await ctx.runMutation(internal.documents.internal.patch, {
      documentId,
      patch: { sourceGuide },
    });

    return sourceGuide;
  },
});

export { resolveDoi } from "./resolveDoi";
export { parseBibliography } from "./parseBibliography";
export { getExistingPapers } from "./getExistingPapers";
export { bulkUpload } from "./bulkUpload";

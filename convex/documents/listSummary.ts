import { type Infer, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { canReadNotebook } from "../_lib/notebookAccess";
import { MAX_DOCUMENTS_PER_NOTEBOOK_LIST, MAX_USER_WIDE_DOCUMENTS } from "../_lib/queryCaps";
import { getAuthUserId } from "../auth";
import { fulltextStatusValidator, ingestionStatusValidator } from "./paperRecord";

/**
 * One row of the live sources list. It carries only what the list UI reads (source rows, chat
 * source count, suggestion signature). `extractedMarkdown`, the full `paperRecord` and `metadata`
 * stay out: the source viewer loads content through `documents.index.getContent`.
 */
const documentSummaryValidator = v.object({
  _id: v.id("documents"),
  _creationTime: v.number(),
  fileName: v.string(),
  fileType: v.string(),
  status: v.string(),
  createdAt: v.number(),
  contentType: v.optional(v.string()),
  fileUrl: v.optional(v.string()),
  googleDriveFileId: v.optional(v.string()),
  wordCount: v.optional(v.number()),
  totalChunks: v.optional(v.number()),
  fulltextStatus: v.optional(fulltextStatusValidator),
  ingestionStatus: v.optional(ingestionStatusValidator),
  /** Identifiers only, for discovery dedupe. */
  paperRecord: v.optional(
    v.object({
      doi: v.optional(v.string()),
      openAlexId: v.optional(v.string()),
    })
  ),
  /** Only the user-facing failure message. */
  metadata: v.optional(v.object({ userMessage: v.string() })),
  sourceGuide: v.optional(
    v.object({
      summary: v.string(),
      topics: v.array(v.string()),
      generatedAt: v.number(),
    })
  ),
});

export type DocumentSummary = Infer<typeof documentSummaryValidator>;

function toDocumentSummary(doc: Doc<"documents">): DocumentSummary {
  const userMessage = (doc.metadata as { userMessage?: unknown } | undefined)?.userMessage;
  return {
    _id: doc._id,
    _creationTime: doc._creationTime,
    fileName: doc.fileName,
    fileType: doc.fileType,
    status: doc.status,
    createdAt: doc.createdAt,
    contentType: doc.contentType,
    fileUrl: doc.fileUrl,
    googleDriveFileId: doc.googleDriveFileId,
    wordCount: doc.wordCount,
    totalChunks: doc.totalChunks,
    fulltextStatus: doc.fulltextStatus,
    ingestionStatus: doc.ingestionStatus,
    paperRecord: doc.paperRecord
      ? { doi: doc.paperRecord.doi, openAlexId: doc.paperRecord.openAlexId }
      : undefined,
    metadata: typeof userMessage === "string" ? { userMessage } : undefined,
    sourceGuide: doc.sourceGuide,
  };
}

/**
 * Summary rows for a notebook's sources (or the user's newest sources when no notebook is given).
 * Same access rules and caps as `documents.index.list`.
 */
export const listSummary = query({
  args: { notebookId: v.optional(v.id("notebooks")) },
  returns: v.array(documentSummaryValidator),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    if (args.notebookId) {
      const notebookId = args.notebookId;
      if (!(await canReadNotebook(ctx, notebookId, userId))) return [];

      const docs = await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .order("desc")
        .take(MAX_DOCUMENTS_PER_NOTEBOOK_LIST);
      return docs.map(toDocumentSummary);
    }

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_USER_WIDE_DOCUMENTS);
    return docs.map(toDocumentSummary);
  },
});

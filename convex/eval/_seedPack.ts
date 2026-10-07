/**
 * Internal functions behind the use-case eval pack seeder. Called only from
 * [seedEvalAction.ts](./seedEvalAction.ts), which gates on RAG_EVAL_SECRET and
 * resolves the owner from RAG_EVAL_OWNER_EMAIL. Pack notebooks live in the
 * owner's "Test" folder; uploads go through the normal docEmbedding job.
 */
import { type Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import * as Notebooks from "../_model/notebooks";
import { deleteAllChunksForDocument } from "../documents/internal";
import { EVAL_PACK_FOLDER_NAME } from "./_packFolder";

export { EVAL_PACK_FOLDER_NAME };

const SOURCE_TEXT_MAX_CHARS = 50_000;

/** Read caps: a pack notebook holds a handful of sources, the owner a few folders. */
const MAX_PACK_NOTEBOOK_DOCS = 200;

/** A pack upload must be adopted soon after getEvalUploadUrl handed out the URL. */
const FRESH_UPLOAD_MAX_AGE_MS = 60 * 60 * 1000;

export const packDocValidator = v.object({
  documentId: v.id("documents"),
  fileName: v.string(),
  status: v.string(),
  sha256: v.optional(v.string()),
  error: v.optional(v.string()),
  totalChunks: v.optional(v.number()),
});

export const packNotebookValidator = v.object({
  notebookId: v.id("notebooks"),
  docs: v.array(packDocValidator),
});

export type PackNotebook = Infer<typeof packNotebookValidator>;

export const packSourceTextValidator = v.array(
  v.object({ fileName: v.string(), text: v.string() })
);

export type PackSourceText = Infer<typeof packSourceTextValidator>;

type DbReader = QueryCtx["db"];

async function ownerIdByEmail(db: DbReader, email: string): Promise<Id<"users">> {
  const user = await db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  if (!user) {
    throw new Error(`RAG_EVAL_OWNER_EMAIL: no user with email ${email} on this deployment.`);
  }
  return user._id;
}

async function findEvalFolder(db: DbReader, userId: Id<"users">): Promise<Doc<"folders"> | null> {
  // Async iteration stops at the first (oldest) match instead of reading every folder.
  for await (const folder of db
    .query("folders")
    .withIndex("by_user", (q) => q.eq("userId", userId))) {
    if (folder.name === EVAL_PACK_FOLDER_NAME) return folder;
  }
  return null;
}

async function findNotebookInFolder(
  db: DbReader,
  userId: Id<"users">,
  folderId: Id<"folders">,
  title: string
): Promise<Doc<"notebooks"> | null> {
  const wanted = title.trim(); // createNotebook trims titles
  for await (const notebook of db
    .query("notebooks")
    .withIndex("by_folder", (q) => q.eq("folderId", folderId))) {
    if (notebook.userId === userId && notebook.title === wanted) return notebook;
  }
  return null;
}

/**
 * Reads a string field from a document's untyped `metadata`. Ingestion failure
 * and `prepareDocumentReembed` overwrite or clear `metadata`, so a lost
 * `evalSourceSha256` just means the seeder replaces the document.
 */
function readMetadataString(metadata: unknown, key: string): string | undefined {
  if (metadata && typeof metadata === "object" && key in metadata) {
    const value = (metadata as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

/** The notebook must belong to the eval owner and live in their Test folder. */
async function assertPackNotebook(
  db: DbReader,
  userId: Id<"users">,
  notebookId: Id<"notebooks">
): Promise<void> {
  const notebook = await db.get(notebookId);
  const folder = await findEvalFolder(db, userId);
  if (!notebook || notebook.userId !== userId || !folder || notebook.folderId !== folder._id) {
    throw new Error("Notebook is not an eval pack notebook in the Test folder.");
  }
}

export const findPackNotebook = internalQuery({
  args: { ownerEmail: v.string(), notebookTitle: v.string() },
  returns: v.union(v.null(), packNotebookValidator),
  handler: async (ctx, args) => {
    const userId = await ownerIdByEmail(ctx.db, args.ownerEmail);
    const folder = await findEvalFolder(ctx.db, userId);
    if (!folder) return null;
    const notebook = await findNotebookInFolder(ctx.db, userId, folder._id, args.notebookTitle);
    if (!notebook) return null;
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", notebook._id))
      .take(MAX_PACK_NOTEBOOK_DOCS);
    return {
      notebookId: notebook._id,
      docs: documents.map((d) => ({
        documentId: d._id,
        fileName: d.fileName,
        status: d.status,
        sha256: readMetadataString(d.metadata, "evalSourceSha256"),
        error: d.error ?? readMetadataString(d.metadata, "error"),
        totalChunks: d.totalChunks,
      })),
    };
  },
});

export const createPackNotebook = internalMutation({
  args: { ownerEmail: v.string(), notebookTitle: v.string() },
  returns: v.id("notebooks"),
  handler: async (ctx, args) => {
    const userId = await ownerIdByEmail(ctx.db, args.ownerEmail);
    const now = Date.now();
    const folderId =
      (await findEvalFolder(ctx.db, userId))?._id ??
      (await ctx.db.insert("folders", {
        userId,
        name: EVAL_PACK_FOLDER_NAME,
        icon: "Folder",
        createdAt: now,
        updatedAt: now,
      }));
    const existing = await findNotebookInFolder(ctx.db, userId, folderId, args.notebookTitle);
    if (existing) return existing._id;
    return await Notebooks.createNotebook(ctx, {
      userId,
      title: args.notebookTitle,
      icon: "Book",
      folderId,
    });
  },
});

export const insertPackDocument = internalMutation({
  args: {
    ownerEmail: v.string(),
    notebookId: v.id("notebooks"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    fileSize: v.number(),
    sha256: v.string(),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    const userId = await ownerIdByEmail(ctx.db, args.ownerEmail);
    await assertPackNotebook(ctx.db, userId, args.notebookId);
    const attached = await ctx.db
      .query("documents")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (attached) {
      throw new Error("storageId is already attached to a document.");
    }
    const now = Date.now();
    const file = await ctx.db.system.get(args.storageId);
    if (!file || now - file._creationTime > FRESH_UPLOAD_MAX_AGE_MS) {
      throw new Error("storageId must be a fresh upload from getEvalUploadUrl.");
    }
    const documentId = await ctx.db.insert("documents", {
      userId,
      notebookId: args.notebookId,
      fileName: args.fileName,
      fileType: "file",
      fileSize: args.fileSize,
      storageId: args.storageId,
      contentType: args.contentType,
      status: "pending",
      metadata: { evalSourceSha256: args.sha256 },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.documents.embeddingJob.docEmbedding, {
      documentId,
      userId,
      notebookId: args.notebookId,
    });
    return documentId;
  },
});

export const deletePackDocument = internalMutation({
  args: { ownerEmail: v.string(), documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await ownerIdByEmail(ctx.db, args.ownerEmail);
    const document = await ctx.db.get(args.documentId);
    if (!document) return null;
    if (document.userId !== userId) {
      throw new Error("Refusing to delete a document the eval owner does not own.");
    }
    await assertPackNotebook(ctx.db, userId, document.notebookId);
    if (document.status === "pending" || document.status === "processing") {
      throw new Error(
        `Document ${document.fileName} is still ingesting; wait for it to finish before replacing it.`
      );
    }
    await deleteAllChunksForDocument(ctx, args.documentId);
    if (document.storageId) {
      await ctx.storage.delete(document.storageId as Id<"_storage">);
    }
    await ctx.db.delete(args.documentId);
    return null;
  },
});

/**
 * Reading a document reads its whole extractedMarkdown (up to ~800K chars), so
 * getPackSourceText calls this once per document to keep each read small.
 */
export const packSourceText = internalQuery({
  args: { ownerEmail: v.string(), documentIds: v.array(v.id("documents")) },
  returns: packSourceTextValidator,
  handler: async (ctx, args) => {
    const userId = await ownerIdByEmail(ctx.db, args.ownerEmail);
    const texts: PackSourceText = [];
    for (const documentId of args.documentIds) {
      const document = await ctx.db.get(documentId);
      if (!document || document.userId !== userId) {
        throw new Error(`Document ${documentId} is not an eval pack document.`);
      }
      await assertPackNotebook(ctx.db, userId, document.notebookId);
      texts.push({
        fileName: document.fileName,
        text: (document.extractedMarkdown ?? "").slice(0, SOURCE_TEXT_MAX_CHARS),
      });
    }
    return texts;
  },
});

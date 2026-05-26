import { action, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getAuthUserId } from "../auth";
import { fetchGoogleDriveBlob, resolveGoogleDriveDownload } from "../_lib/googleDriveDownload";
import type { Doc } from "../_generated/dataModel";

const refreshSummaryValidator = v.object({
  urlCount: v.number(),
  driveRefreshed: v.number(),
  driveSkippedNoToken: v.number(),
});

async function refreshDriveDocument(
  ctx: ActionCtx,
  doc: Doc<"documents">,
  accessToken: string,
  delayMs: number
): Promise<void> {
  const fileId = doc.googleDriveFileId;
  const mimeType = doc.googleDriveMimeType;
  if (!fileId || !mimeType) {
    throw new Error("Google Drive file metadata missing");
  }

  const { downloadUrl } = resolveGoogleDriveDownload(fileId, doc.fileName, mimeType);

  const blob = await fetchGoogleDriveBlob(downloadUrl, accessToken);
  const newStorageId = await ctx.storage.store(blob);

  await ctx.runMutation(internal.documents.internal.prepareDocumentReembed, {
    documentId: doc._id,
    delayMs,
    newStorageId: newStorageId as unknown as string,
  });
}

export const refreshNotebookRemoteSources = action({
  args: {
    notebookId: v.id("notebooks"),
    accessToken: v.optional(v.string()),
  },
  returns: refreshSummaryValidator,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const docs = await ctx.runQuery(internal.documents.internal.listDocumentsForNotebookRefresh, {
      notebookId: args.notebookId,
      userId,
    });

    let urlCount = 0;
    let driveRefreshed = 0;
    let driveSkippedNoToken = 0;

    for (const doc of docs) {
      if (doc.fileType === "url") {
        urlCount += 1;
        const delayMs = Math.floor(Math.random() * 8000);
        await ctx.runMutation(internal.documents.internal.prepareDocumentReembed, {
          documentId: doc._id,
          delayMs,
        });
        continue;
      }

      if (doc.fileType === "file" && doc.googleDriveFileId && doc.googleDriveMimeType) {
        if (!args.accessToken) {
          driveSkippedNoToken += 1;
          continue;
        }
        await refreshDriveDocument(ctx, doc, args.accessToken, 0);
        driveRefreshed += 1;
      }
    }

    return { urlCount, driveRefreshed, driveSkippedNoToken };
  },
});

export const refreshRemoteSource = action({
  args: {
    documentId: v.id("documents"),
    accessToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const doc = await ctx.runQuery(internal.documents.internal.getDocumentForRefresh, {
      documentId: args.documentId,
      userId,
    });

    if (!doc) {
      throw new Error("Document not found");
    }

    if (doc.fileType === "url") {
      await ctx.runMutation(internal.documents.internal.prepareDocumentReembed, {
        documentId: doc._id,
        delayMs: 0,
      });
      return null;
    }

    if (doc.fileType === "file" && doc.googleDriveFileId && doc.googleDriveMimeType) {
      if (!args.accessToken) {
        throw new Error("Google sign-in is required to refresh this Google Drive source.");
      }
      await refreshDriveDocument(ctx, doc, args.accessToken, 0);
      return null;
    }

    throw new Error("This source cannot be refreshed.");
  },
});

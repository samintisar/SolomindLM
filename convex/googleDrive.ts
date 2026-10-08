import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import { fetchGoogleDriveBlob, resolveGoogleDriveDownload } from "./_lib/googleDriveDownload";
import { getAuthUserId } from "./auth";

export const ingestFromGoogleDrive = action({
  args: {
    notebookId: v.id("notebooks"),
    fileId: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    accessToken: v.string(),
  },
  returns: v.object({
    documentId: v.string(),
    status: v.string(),
    message: v.string(),
  }),
  handler: async (ctx, args): Promise<{ documentId: string; status: string; message: string }> => {
    const { fileId, fileName, mimeType, accessToken, notebookId } = args;

    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    // Check access and the source limit before downloading, so a refused call stores nothing.
    await ctx.runQuery(internal.documents.index.assertCanAddSourceInternal, { notebookId, userId });

    const { downloadUrl, finalContentType, finalFileName } = resolveGoogleDriveDownload(
      fileId,
      fileName,
      mimeType
    );

    const blob = await fetchGoogleDriveBlob(downloadUrl, accessToken);
    const storageId = await ctx.storage.store(blob);

    try {
      return (await ctx.runMutation(api.documents.index.upload, {
        notebookId,
        type: "file" as const,
        storageId: storageId as unknown as string,
        fileName: finalFileName,
        contentType: finalContentType,
        googleDriveFileId: fileId,
        googleDriveMimeType: mimeType,
      })) as {
        documentId: string;
        status: string;
        message: string;
      };
    } catch (error) {
      // The upload re-checks access and limits; don't leave the downloaded file orphaned. A failed
      // delete is logged, not thrown, so the caller still sees the upload error (e.g. the limit).
      await ctx.storage.delete(storageId).catch((deleteError: unknown) => {
        console.error(`[googleDrive] could not delete orphaned file ${storageId}`, deleteError);
      });
      throw error;
    }
  },
});

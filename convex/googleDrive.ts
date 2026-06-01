import { v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import { fetchGoogleDriveBlob, resolveGoogleDriveDownload } from "./_lib/googleDriveDownload";

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

    const { downloadUrl, finalContentType, finalFileName } = resolveGoogleDriveDownload(
      fileId,
      fileName,
      mimeType
    );

    const blob = await fetchGoogleDriveBlob(downloadUrl, accessToken);
    const storageId = await ctx.storage.store(blob);

    const result = (await ctx.runMutation(api.documents.index.upload, {
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

    return result;
  },
});

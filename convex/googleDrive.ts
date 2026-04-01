import { action } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';

const EXPORT_MIME_MAP: Record<string, { mimeType: string; extension: string }> = {
  'application/vnd.google-apps.document': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: '.docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'text/csv',
    extension: '.csv',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/pdf',
    extension: '.pdf',
  },
  'application/vnd.google-apps.drawing': {
    mimeType: 'image/png',
    extension: '.png',
  },
};

export const ingestFromGoogleDrive = action({
  args: {
    notebookId: v.id('notebooks'),
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

    let downloadUrl: string;
    let finalContentType: string;
    let finalFileName = fileName;

    const exportConfig = EXPORT_MIME_MAP[mimeType];
    if (exportConfig) {
      finalContentType = exportConfig.mimeType;
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(finalContentType)}`;
      if (!finalFileName.includes('.')) {
        finalFileName += exportConfig.extension;
      }
    } else {
      finalContentType = mimeType;
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    }

    const response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Drive API error (${response.status}): ${errorBody}`,
      );
    }

    const blob = await response.blob();
    const storageId = await ctx.storage.store(blob);

    const uploadArgs = {
      notebookId,
      type: 'file' as const,
      storageId: storageId as unknown as string,
      fileName: finalFileName,
      contentType: finalContentType,
    };

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/c40b03dc-b194-43e0-8425-638bcd5bfca0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f9b18a'},body:JSON.stringify({sessionId:'f9b18a',runId:'gd-upload-postfix',hypothesisId:'H6',location:'convex/googleDrive.ts:handler',message:'Prepared Google Drive upload args',data:{sourceMimeType:mimeType,finalFileName,finalContentType,isExportedType:Boolean(exportConfig)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const result = await ctx.runMutation(api.documents.index.upload, uploadArgs) as {
      documentId: string;
      status: string;
      message: string;
    };

    return result;
  },
});

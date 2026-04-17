/**
 * Shared Google Drive export/media URL resolution and download (used by ingest + refresh).
 */

export const EXPORT_MIME_MAP: Record<string, { mimeType: string; extension: string }> = {
  "application/vnd.google-apps.document": {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: ".docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mimeType: "text/csv",
    extension: ".csv",
  },
  "application/vnd.google-apps.presentation": {
    mimeType: "application/pdf",
    extension: ".pdf",
  },
  "application/vnd.google-apps.drawing": {
    mimeType: "image/png",
    extension: ".png",
  },
};

export function resolveGoogleDriveDownload(
  fileId: string,
  fileName: string,
  mimeType: string
): { downloadUrl: string; finalContentType: string; finalFileName: string } {
  let downloadUrl: string;
  let finalContentType: string;
  let finalFileName = fileName;

  const exportConfig = EXPORT_MIME_MAP[mimeType];
  if (exportConfig) {
    finalContentType = exportConfig.mimeType;
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(finalContentType)}`;
    if (!finalFileName.includes(".")) {
      finalFileName += exportConfig.extension;
    }
  } else {
    finalContentType = mimeType;
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  }

  return { downloadUrl, finalContentType, finalFileName };
}

export async function fetchGoogleDriveBlob(
  downloadUrl: string,
  accessToken: string
): Promise<Blob> {
  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Drive API error (${response.status}): ${errorBody}`);
  }
  return response.blob();
}

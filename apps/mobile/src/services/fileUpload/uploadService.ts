export async function uploadPickedFileToNotebook(options: {
  generateUploadUrl: () => Promise<string>;
  createDocument: (args: {
    notebookId: string;
    type: "file";
    storageId: string;
    fileName: string;
    fileSize?: number;
    contentType?: string;
  }) => Promise<{ documentId: string }>;
  notebookId: string;
  fileUri: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
}): Promise<{ documentId: string }> {
  const uploadUrl = await options.generateUploadUrl();

  const fileRes = await fetch(options.fileUri);
  if (!fileRes.ok) {
    throw new Error("Could not read file for upload");
  }
  const buffer = await fileRes.arrayBuffer();

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": options.mimeType || "application/octet-stream",
    },
    body: buffer,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload file to storage");
  }

  const { storageId } = (await uploadResponse.json()) as { storageId: string };

  const result = await options.createDocument({
    notebookId: options.notebookId,
    type: "file",
    storageId,
    fileName: options.fileName,
    fileSize: options.fileSize,
    contentType: options.mimeType,
  });

  return { documentId: result.documentId };
}

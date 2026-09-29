import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { PackSeedApi } from "./seedClient";

/** PackSeedApi over the gated actions in convex/eval/seedEvalAction.ts. */
export function createConvexSeedApi(convexUrl: string, evalSecret: string): PackSeedApi {
  const client = new ConvexHttpClient(convexUrl);
  return {
    resolve: (notebookTitle) =>
      client.action(api.eval.seedEvalAction.resolvePackNotebook, { evalSecret, notebookTitle }),
    create: (notebookTitle) =>
      client.action(api.eval.seedEvalAction.createPackNotebook, { evalSecret, notebookTitle }),
    upload: async (file) => {
      const uploadUrl = await client.action(api.eval.seedEvalAction.getEvalUploadUrl, {
        evalSecret,
      });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.contentType },
        body: new Blob([new Uint8Array(file.bytes)], { type: file.contentType }),
      });
      if (!response.ok) {
        throw new Error(`Upload of ${file.fileName} failed: HTTP ${response.status}`);
      }
      const { storageId } = (await response.json()) as { storageId: string };
      return storageId;
    },
    add: ({ notebookId, storageId, file }) =>
      client.action(api.eval.seedEvalAction.addPackDocument, {
        evalSecret,
        notebookId: notebookId as Id<"notebooks">,
        storageId: storageId as Id<"_storage">,
        fileName: file.fileName,
        contentType: file.contentType,
        fileSize: file.bytes.byteLength,
        sha256: file.sha256,
      }),
    remove: async (documentId) => {
      await client.action(api.eval.seedEvalAction.removePackDocument, {
        evalSecret,
        documentId: documentId as Id<"documents">,
      });
    },
    sourceText: (documentIds) =>
      client.action(api.eval.seedEvalAction.getPackSourceText, {
        evalSecret,
        documentIds: documentIds as Id<"documents">[],
      }),
  };
}

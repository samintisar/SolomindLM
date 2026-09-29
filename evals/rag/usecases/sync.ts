import type { SourceDigest } from "./sources";
import { EVAL_PACK_FOLDER_NAME, type UseCasePack } from "./types";

/** A document in a pack notebook, as returned by the resolvePackNotebook action. */
export interface RemotePackDoc {
  documentId: string;
  fileName: string;
  status: string;
  sha256?: string;
  error?: string;
  totalChunks?: number;
}

export interface RemotePackNotebook {
  notebookId: string;
  docs: RemotePackDoc[];
}

export type SyncAction =
  | { kind: "upload"; fileName: string }
  | { kind: "replace"; fileName: string; documentId: string; reason: "changed" | "failed" }
  | { kind: "skip"; fileName: string; documentId: string };

/** Decide what the seeder does for each committed source. Unrelated notebook docs are left alone. */
export function planPackSync(local: SourceDigest[], remote: RemotePackDoc[]): SyncAction[] {
  return local.map((file): SyncAction => {
    const doc = remote.find((d) => d.fileName === file.fileName);
    if (!doc) return { kind: "upload", fileName: file.fileName };
    if (doc.status === "failed") {
      return {
        kind: "replace",
        fileName: file.fileName,
        documentId: doc.documentId,
        reason: "failed",
      };
    }
    if (doc.sha256 !== file.sha256) {
      return {
        kind: "replace",
        fileName: file.fileName,
        documentId: doc.documentId,
        reason: "changed",
      };
    }
    return { kind: "skip", fileName: file.fileName, documentId: doc.documentId };
  });
}

export interface PackReadiness {
  useCase: string;
  notebookId: string | null;
  /** Documents matching the pack's sources (never hand-added docs) */
  documentIds: string[];
  /** Empty when the pack is ready to run */
  problems: string[];
}

/** A pack is ready when every source is present, current and completed. */
export function checkPackReady(
  pack: UseCasePack,
  local: SourceDigest[],
  remote: RemotePackNotebook | null
): PackReadiness {
  if (!remote) {
    return {
      useCase: pack.id,
      notebookId: null,
      documentIds: [],
      problems: [
        `notebook "${pack.notebookTitle}" not found in the ${EVAL_PACK_FOLDER_NAME} folder`,
      ],
    };
  }
  const problems: string[] = [];
  const documentIds: string[] = [];
  for (const file of local) {
    const doc = remote.docs.find((d) => d.fileName === file.fileName);
    if (!doc) {
      problems.push(`${file.fileName}: not uploaded`);
      continue;
    }
    documentIds.push(doc.documentId);
    if (doc.sha256 !== file.sha256) {
      problems.push(`${file.fileName}: out of date`);
    } else if (doc.status !== "completed") {
      problems.push(`${file.fileName}: ${doc.status}${doc.error ? ` (${doc.error})` : ""}`);
    }
  }
  return { useCase: pack.id, notebookId: remote.notebookId, documentIds, problems };
}

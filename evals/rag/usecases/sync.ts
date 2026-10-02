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
  | {
      kind: "replace";
      fileName: string;
      documentId: string;
      reason: "changed" | "failed" | "reingest";
    }
  | { kind: "skip"; fileName: string; documentId: string };

/**
 * Decide what the seeder does for each committed source. Unrelated notebook docs
 * are left alone. With `reingest`, up-to-date documents are replaced too, so they
 * go through the current ingestion pipeline again.
 */
export function planPackSync(
  local: SourceDigest[],
  remote: RemotePackDoc[],
  options: { reingest?: boolean } = {}
): SyncAction[] {
  for (const file of local) {
    const count = remote.filter((d) => d.fileName === file.fileName).length;
    if (count > 1) {
      throw new Error(
        `Pack notebook has ${count} documents named "${file.fileName}"; delete the extras in the app, then re-seed.`
      );
    }
    const doc = remote.find((d) => d.fileName === file.fileName);
    const inFlight = doc && (doc.status === "pending" || doc.status === "processing");
    if (inFlight && options.reingest) {
      throw new Error(
        `"${file.fileName}" is still ingesting; wait for it to finish, then re-run eval:seed --reingest.`
      );
    }
    if (
      doc &&
      (doc.status === "pending" || doc.status === "processing") &&
      doc.sha256 !== file.sha256
    ) {
      throw new Error(
        `"${file.fileName}" is still ingesting an older version; wait for it to finish, then re-run eval:seed (if it is stuck, delete it in the app).`
      );
    }
  }
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
    if (options.reingest) {
      return {
        kind: "replace",
        fileName: file.fileName,
        documentId: doc.documentId,
        reason: "reingest",
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
  /** Source file name of each entry in `documentIds` */
  documentFileNames: Record<string, string>;
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
      documentFileNames: {},
      problems: [
        `notebook "${pack.notebookTitle}" not found in the ${EVAL_PACK_FOLDER_NAME} folder`,
      ],
    };
  }
  const problems: string[] = [];
  const documentIds: string[] = [];
  const documentFileNames: Record<string, string> = {};
  for (const file of local) {
    const matches = remote.docs.filter((d) => d.fileName === file.fileName);
    if (matches.length === 0) {
      problems.push(`${file.fileName}: not uploaded`);
      continue;
    }
    if (matches.length > 1) {
      problems.push(`${file.fileName}: ${matches.length} documents with this name`);
      continue;
    }
    const doc = matches[0];
    documentIds.push(doc.documentId);
    documentFileNames[doc.documentId] = file.fileName;
    if (doc.status === "failed") {
      problems.push(`${file.fileName}: failed${doc.error ? ` (${doc.error})` : ""}`);
    } else if (doc.sha256 !== file.sha256) {
      problems.push(`${file.fileName}: out of date`);
    } else if (doc.status !== "completed") {
      problems.push(`${file.fileName}: ${doc.status}`);
    }
  }
  return {
    useCase: pack.id,
    notebookId: remote.notebookId,
    documentIds,
    documentFileNames,
    problems,
  };
}

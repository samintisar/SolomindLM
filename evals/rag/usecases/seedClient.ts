import type { LocalSourceFile } from "./sources";
import {
  checkPackReady,
  planPackSync,
  type RemotePackDoc,
  type RemotePackNotebook,
  type SyncAction,
} from "./sync";
import type { SourceText, UseCasePack } from "./types";

/** Operations the seeder needs; implemented over Convex in convexSeedApi.ts. */
export interface PackSeedApi {
  resolve(notebookTitle: string): Promise<RemotePackNotebook | null>;
  create(notebookTitle: string): Promise<string>;
  /** Upload file bytes to storage; returns the storage id */
  upload(file: LocalSourceFile): Promise<string>;
  add(args: { notebookId: string; storageId: string; file: LocalSourceFile }): Promise<string>;
  remove(documentId: string): Promise<void>;
  sourceText(documentIds: string[]): Promise<SourceText[]>;
}

export interface SeedPackOptions {
  pollMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (line: string) => void;
}

export interface SeedPackResult {
  notebookId: string;
  documentIds: string[];
  actions: SyncAction[];
  totalChunks: number;
}

/** Statuses that mean ingestion is still running, so a stale hash is expected to settle. */
const IN_FLIGHT = new Set(["pending", "processing"]);

const DEFAULT_POLL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

/** Sync a pack's committed sources into its notebook and wait for ingestion. */
export async function seedPack(
  pack: UseCasePack,
  local: LocalSourceFile[],
  api: PackSeedApi,
  options: SeedPackOptions = {}
): Promise<SeedPackResult> {
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);

  const existing = await api.resolve(pack.notebookTitle);
  // Plan before mutating anything: planPackSync throws on states it cannot reconcile.
  const actions = planPackSync(local, existing?.docs ?? []);
  const notebookId = existing?.notebookId ?? (await api.create(pack.notebookTitle));

  for (const action of actions) {
    if (action.kind === "skip") continue;
    const file = local.find((f) => f.fileName === action.fileName);
    if (!file) throw new Error(`${pack.id}: planned ${action.fileName} but it was not read`);
    // Upload first so a failed upload never deletes the existing document.
    const storageId = await api.upload(file);
    try {
      if (action.kind === "replace") {
        log(`  replace ${action.fileName} (${action.reason})`);
        await api.remove(action.documentId);
      } else {
        log(`  upload ${action.fileName}`);
      }
      await api.add({ notebookId, storageId, file });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${message} (uploaded storage ${storageId} is now orphaned)`, {
        cause: err,
      });
    }
  }

  const deadline = now() + timeoutMs;
  for (;;) {
    const remote = await api.resolve(pack.notebookTitle);
    if (!remote) {
      throw new Error(`${pack.id}: notebook "${pack.notebookTitle}" disappeared during seeding`);
    }
    const failed: RemotePackDoc[] = [];
    for (const f of local) {
      const matches = remote.docs.filter((d) => d.fileName === f.fileName);
      if (matches.length === 0) {
        throw new Error(
          `${pack.id}: ${f.fileName} is missing after upload (was it deleted, or is another eval:seed running?)`
        );
      }
      if (matches.length > 1) {
        throw new Error(
          `${pack.id}: ${f.fileName} has ${matches.length} copies (is another eval:seed running?); delete the extras in the app`
        );
      }
      const doc = matches[0];
      if (doc.status === "failed") {
        failed.push(doc);
      } else if (doc.sha256 !== f.sha256 && !IN_FLIGHT.has(doc.status)) {
        throw new Error(
          `${pack.id}: ${f.fileName} was changed by another process (is another eval:seed running?)`
        );
      }
    }
    if (failed.length > 0) {
      const detail = failed.map((d) => `${d.fileName}: ${d.error ?? "unknown error"}`).join("; ");
      throw new Error(`${pack.id}: ingestion failed — ${detail}`);
    }

    const readiness = checkPackReady(pack, local, remote);
    if (readiness.problems.length === 0) {
      const packDocs = remote.docs.filter((d) => readiness.documentIds.includes(d.documentId));
      return {
        notebookId,
        documentIds: readiness.documentIds,
        actions,
        totalChunks: packDocs.reduce((sum, d) => sum + (d.totalChunks ?? 0), 0),
      };
    }
    if (now() >= deadline) {
      throw new Error(
        `${pack.id}: timed out waiting for ingestion — ${readiness.problems.join("; ")}. ` +
          `Re-run eval:seed to keep waiting; if a document is stuck, delete it in the app ` +
          `(Test folder → ${pack.notebookTitle}) and re-run.`
      );
    }
    await sleep(pollMs);
  }
}

import type { LocalSourceFile } from "./sources";
import { checkPackReady, planPackSync, type RemotePackNotebook, type SyncAction } from "./sync";
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
    if (action.kind === "replace") {
      log(`  replace ${action.fileName} (${action.reason})`);
      await api.remove(action.documentId);
    } else {
      log(`  upload ${action.fileName}`);
    }
    const file = local.find((f) => f.fileName === action.fileName);
    if (!file) throw new Error(`${pack.id}: planned ${action.fileName} but it was not read`);
    const storageId = await api.upload(file);
    await api.add({ notebookId, storageId, file });
  }

  const deadline = now() + timeoutMs;
  for (;;) {
    const remote = await api.resolve(pack.notebookTitle);
    const readiness = checkPackReady(pack, local, remote);
    if (readiness.problems.length === 0 && remote) {
      const packDocs = remote.docs.filter((d) => readiness.documentIds.includes(d.documentId));
      return {
        notebookId,
        documentIds: readiness.documentIds,
        actions,
        totalChunks: packDocs.reduce((sum, d) => sum + (d.totalChunks ?? 0), 0),
      };
    }
    const failed = (remote?.docs ?? []).filter(
      (d) => d.status === "failed" && local.some((f) => f.fileName === d.fileName)
    );
    if (failed.length > 0) {
      const detail = failed.map((d) => `${d.fileName}: ${d.error ?? "unknown error"}`).join("; ");
      throw new Error(`${pack.id}: ingestion failed — ${detail}`);
    }
    if (now() >= deadline) {
      throw new Error(
        `${pack.id}: timed out waiting for ingestion — ${readiness.problems.join("; ")}`
      );
    }
    await sleep(pollMs);
  }
}

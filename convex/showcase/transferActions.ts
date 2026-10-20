"use node";
/**
 * Moves a showcase notebook between deployments through file storage, so only short arguments
 * cross the CLI (plan: docs/superpowers/plans/2026-10-20-showcase-copy-to-prod.md):
 *   source: npx convex run showcase/transferActions:exportBundle '{"ownerEmail":"…","slug":"…"}'
 *   target: npx convex run --prod showcase/transferActions:importBundle '{"ownerEmail":"…","bundleUrl":"…"}'
 *   source: npx convex run showcase/transferActions:deleteBundle '{"storageIds":[…]}'
 * The bundle URL is a storage URL: anyone holding it can read the bundle, which only holds the
 * notebook's openly licensed sources and Studio items. Delete it once the import is checked.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { STUDIO_TABLES } from "./transfer";
import { leftoverSourceRefs, remapDeep, withoutSystemFields } from "./transferRemap";

const BUNDLE_VERSION = 1;
/** Rows per insertRows call stay well under the 8 MiB argument limit. */
const MAX_BATCH_BYTES = 4 * 1024 * 1024;
const MAX_BATCH_ROWS = 100;
const FETCH_TIMEOUT_MS = 120_000;
const ROLLBACK_BATCH = 200;

type Row = Record<string, unknown>;

interface BundleFile {
  /** Set for files the source names by storage id (PDF sources, audio). */
  storageId?: string;
  url: string;
  /** Other strings that point at the same file (e.g. a stored audioUrl). */
  alsoUrls: string[];
}

interface Bundle {
  version: number;
  sourceHost: string;
  slug: string;
  sourceUserId: string;
  notebook: Row & { _id: string; title: string };
  documents: Row[];
  citations: Row[];
  literatureTables: Row[];
  literatureReports: Row[];
  studio: Record<string, Row[]>;
  /** Source document id → storage URL of that document's chunks (a JSON array). */
  chunkFiles: Record<string, string>;
  files: BundleFile[];
}

function sourceHost(): string {
  const url = process.env.CONVEX_CLOUD_URL;
  return url ? new URL(url).host : "";
}

async function storeJson(
  ctx: ActionCtx,
  value: unknown
): Promise<{ id: Id<"_storage">; url: string }> {
  const id = await ctx.storage.store(
    new Blob([JSON.stringify(value)], { type: "application/json" })
  );
  const url = await ctx.storage.getUrl(id);
  if (!url) throw new Error("Stored the bundle but got no URL for it");
  return { id, url };
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}`);
  return response;
}

/** Writes one showcase notebook to a bundle in this deployment's storage and returns its URL. */
export const exportBundle = internalAction({
  args: { ownerEmail: v.string(), slug: v.string() },
  returns: v.object({
    bundleUrl: v.string(),
    storageIds: v.array(v.string()),
    counts: v.record(v.string(), v.number()),
  }),
  handler: async (ctx, args) => {
    const rows = await ctx.runQuery(internal.showcase.transfer.exportNotebookRows, args);
    const storageIds: string[] = [];
    const counts: Record<string, number> = {
      documents: rows.documents.length,
      citations: rows.citations.length,
      literatureTables: rows.literatureTables.length,
      literatureReports: rows.literatureReports.length,
      chunks: 0,
    };

    const chunkFiles: Record<string, string> = {};
    for (const doc of rows.documents) {
      const chunks: Row[] = [];
      let cursor: string | null = null;
      for (;;) {
        const page: { page: unknown[]; isDone: boolean; continueCursor: string } =
          await ctx.runQuery(internal.showcase.transfer.exportChunksPage, {
            documentId: doc._id,
            cursor,
          });
        chunks.push(...(page.page as Row[]));
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      counts.chunks += chunks.length;
      const stored = await storeJson(ctx, chunks);
      storageIds.push(stored.id);
      chunkFiles[doc._id] = stored.url;
    }

    const files: BundleFile[] = [];
    for (const doc of rows.documents) {
      if (!doc.storageId) continue;
      const url = await ctx.storage.getUrl(doc.storageId as Id<"_storage">);
      if (url) files.push({ storageId: doc.storageId, url, alsoUrls: [] });
    }
    for (const [table, list] of Object.entries(rows.studio as Record<string, Row[]>)) {
      counts[table] = list.length;
      for (const row of list) {
        if (table === "audioOverviews" && typeof row.audioStorageId === "string") {
          const url = await ctx.storage.getUrl(row.audioStorageId as Id<"_storage">);
          if (url) {
            const alsoUrls =
              typeof row.audioUrl === "string" && row.audioUrl !== url ? [row.audioUrl] : [];
            files.push({ storageId: row.audioStorageId, url, alsoUrls });
          }
        }
        if (table === "infographics") {
          const imageUrl = (row.data as Row | undefined)?.imageUrl;
          if (typeof imageUrl === "string") files.push({ url: imageUrl, alsoUrls: [] });
        }
      }
    }

    const bundle: Bundle = {
      version: BUNDLE_VERSION,
      sourceHost: sourceHost(),
      slug: rows.slug,
      sourceUserId: rows.sourceUserId,
      notebook: rows.notebook as Bundle["notebook"],
      documents: rows.documents as Row[],
      citations: rows.citations as Row[],
      literatureTables: rows.literatureTables as Row[],
      literatureReports: rows.literatureReports as Row[],
      studio: rows.studio as Record<string, Row[]>,
      chunkFiles,
      files,
    };
    const stored = await storeJson(ctx, bundle);
    storageIds.push(stored.id);
    counts.files = files.length;
    return { bundleUrl: stored.url, storageIds, counts };
  },
});

/** Deletes a bundle's files from this deployment's storage once the import is checked. */
export const deleteBundle = internalAction({
  args: { storageIds: v.array(v.string()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    for (const id of args.storageIds) await ctx.storage.delete(id as Id<"_storage">);
    return args.storageIds.length;
  },
});

/** Splits rows into insert batches by count and serialized size. */
function batches(rows: Row[]): Row[][] {
  const out: Row[][] = [];
  let current: Row[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = JSON.stringify(row).length;
    if (
      current.length > 0 &&
      (current.length >= MAX_BATCH_ROWS || bytes + size > MAX_BATCH_BYTES)
    ) {
      out.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Copies a bundle into this deployment: a new notebook in the owner's "Showcase" folder (or
 * `folderName`, for a rehearsal), its sources and chunks, citations, literature tables and
 * reports, and Studio items, with every id, storage id and file URL rewritten. Stops before
 * writing a row that still names the source deployment.
 */
export const importBundle = internalAction({
  args: { ownerEmail: v.string(), bundleUrl: v.string(), folderName: v.optional(v.string()) },
  returns: v.object({ notebookId: v.string(), counts: v.record(v.string(), v.number()) }),
  handler: async (ctx, args): Promise<{ notebookId: string; counts: Record<string, number> }> => {
    const bundle = (await (await fetchOk(args.bundleUrl)).json()) as Bundle;
    if (bundle.version !== BUNDLE_VERSION) {
      throw new Error(`Bundle version ${bundle.version}; this deployment reads ${BUNDLE_VERSION}`);
    }
    if (bundle.sourceHost && bundle.sourceHost === sourceHost()) {
      // Same deployment: ids would map onto themselves and leftovers couldn't be told apart.
      if (!args.folderName)
        throw new Error("Importing into the source deployment needs folderName");
    }

    const { notebookId, userId }: { notebookId: string; userId: string } = await ctx.runMutation(
      internal.showcase.transfer.beginImport,
      {
        ownerEmail: args.ownerEmail,
        title: bundle.notebook.title,
        icon: bundle.notebook.icon as string | undefined,
        coverColor: bundle.notebook.coverColor as string | undefined,
        chatSettings: bundle.notebook.chatSettings,
        folderName: args.folderName,
      }
    );

    const inserted: Array<{ table: string; ids: string[] }> = [];
    const stored: Id<"_storage">[] = [];
    try {
      const ids = new Map<string, string>([
        [bundle.sourceUserId, userId],
        [bundle.notebook._id, notebookId],
      ]);
      const exact = new Map<string, string>();
      const sourceIds = new Set<string>([bundle.notebook._id]);
      // Into the same account on the same deployment (a rehearsal), the owner maps to itself.
      if (userId !== bundle.sourceUserId) sourceIds.add(bundle.sourceUserId);
      const counts: Record<string, number> = {};

      for (const file of bundle.files) {
        const response = await fetchOk(file.url);
        const type = response.headers.get("content-type") ?? "application/octet-stream";
        const newId = await ctx.storage.store(new Blob([await response.arrayBuffer()], { type }));
        stored.push(newId);
        const newUrl = await ctx.storage.getUrl(newId);
        if (!newUrl) throw new Error("Stored a file but got no URL for it");
        if (file.storageId) {
          ids.set(file.storageId, newId);
          sourceIds.add(file.storageId);
        }
        for (const url of [file.url, ...file.alsoUrls]) exact.set(url, newUrl);
      }
      counts.files = bundle.files.length;

      // Same-deployment rehearsals can't flag leftovers by host; ids still catch them.
      const host = bundle.sourceHost === sourceHost() ? "" : bundle.sourceHost;
      const prepare = (row: Row, overrides: Row = {}): Row => {
        const remapped = remapDeep({ ...withoutSystemFields(row), ...overrides }, ids, exact);
        const leftovers = leftoverSourceRefs(remapped, sourceIds, host);
        if (leftovers.length > 0) {
          throw new Error(
            `A copied row still names the source deployment: ${leftovers.join(", ")}`
          );
        }
        return remapped;
      };
      const insert = async (table: string, sourceRows: Row[], prepared: Row[]) => {
        // Recorded before the batches run, so a failure part-way rolls back the earlier batches.
        const newIds: string[] = [];
        inserted.push({ table, ids: newIds });
        for (const batch of batches(prepared)) {
          newIds.push(
            ...(await ctx.runMutation(internal.showcase.transfer.insertRows, {
              notebookId: notebookId as Id<"notebooks">,
              table: table as never,
              rows: batch,
            }))
          );
        }
        sourceRows.forEach((row, i) => ids.set(row._id as string, newIds[i]));
        counts[table] = (counts[table] ?? 0) + newIds.length;
      };

      // Every source id is known up front, so a row naming one that wasn't copied is caught.
      for (const row of [
        ...bundle.documents,
        ...bundle.citations,
        ...bundle.literatureTables,
        ...bundle.literatureReports,
        ...Object.values(bundle.studio).flat(),
      ]) {
        sourceIds.add(row._id as string);
      }

      // Documents first (no references to other rows), then their chunks.
      const sourceDocs = bundle.documents;
      await insert(
        "documents",
        sourceDocs,
        sourceDocs.map((d) => prepare(d, { userId, notebookId }))
      );
      for (const doc of sourceDocs) {
        const chunkUrl = bundle.chunkFiles[doc._id as string];
        if (!chunkUrl) continue;
        const chunks = (await (await fetchOk(chunkUrl)).json()) as Row[];
        for (const c of chunks) sourceIds.add(c._id as string);
        await insert(
          "documentChunks",
          chunks,
          chunks.map((c) => prepare(c, { userId, notebookId }))
        );
      }

      // Citations are global rows; a notebook-paper citation names a source document.
      await insert(
        "citations",
        bundle.citations,
        bundle.citations.map((c) => prepare(c))
      );
      await insert(
        "literatureTables",
        bundle.literatureTables,
        bundle.literatureTables.map((t) => prepare(t, { userId, notebookId }))
      );
      await insert(
        "literatureReports",
        bundle.literatureReports,
        bundle.literatureReports.map((r) => prepare(r, { userId, notebookId }))
      );
      for (const table of STUDIO_TABLES) {
        const rows = bundle.studio[table] ?? [];
        await insert(
          table,
          rows,
          rows.map((r) => prepare(r, { userId, notebookId }))
        );
      }
      return { notebookId, counts };
    } catch (error) {
      // Leave nothing half-copied: the rows this run inserted, its notebook and its files.
      for (const { table, ids: rowIds } of inserted.reverse()) {
        for (let i = 0; i < rowIds.length; i += ROLLBACK_BATCH) {
          await ctx.runMutation(internal.showcase.transfer.abortImport, {
            notebookId: notebookId as Id<"notebooks">,
            table: table as never,
            ids: rowIds.slice(i, i + ROLLBACK_BATCH),
          });
        }
      }
      await ctx.runMutation(internal.showcase.transfer.abortImport, {
        notebookId: notebookId as Id<"notebooks">,
      });
      for (const id of stored) await ctx.storage.delete(id);
      throw error;
    }
  },
});

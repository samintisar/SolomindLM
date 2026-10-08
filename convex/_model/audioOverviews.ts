import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canReadNotebook } from "../_lib/notebookAccess";

/**
 * Database operations for audio overviews.
 * No query/mutation/action exports — used by convex/audioOverviews.ts and jobs.
 */

/** What an `audioUrl` points at: a playable URL, a stored file, or nothing usable (null). */
export type AudioUrlTarget = { url: string } | { storageRef: string } | null;

/**
 * Parse an `audioUrl`: full http(s) URLs play as-is; a bare storage id or a legacy
 * `/audio/<storageId>` path names a stored file.
 */
export function parseAudioUrl(audioUrl: string): AudioUrlTarget {
  const raw = audioUrl.trim();
  if (!raw) return null;
  // URI schemes are case-insensitive (RFC 3986), so `HTTPS://…` is a URL too.
  if (/^https?:\/\//i.test(raw)) return { url: raw };
  let ref = raw;
  if (ref.startsWith("/audio/")) ref = ref.slice("/audio/".length);
  else if (ref.startsWith("audio/")) ref = ref.slice("audio/".length);
  if (ref.startsWith("/")) ref = ref.slice(1);
  return ref ? { storageRef: ref } : null;
}

/** Playback URL for a stored file, or null when the reference names no file. */
export async function storageUrlForRef(ctx: QueryCtx, storageRef: string): Promise<string | null> {
  const storageId = ctx.db.system.normalizeId("_storage", storageRef);
  if (storageId) return await ctx.storage.getUrl(storageId);
  try {
    // Pre-Id storage ids are plain strings that `getUrl` still accepts; it throws on anything else.
    return await ctx.storage.getUrl(storageRef as Id<"_storage">);
  } catch {
    return null;
  }
}

/**
 * Walks every overview the query matches (forks of a shared notebook can be many) and stops at
 * the first whose notebook the user can read. `checked` skips notebooks already ruled out.
 */
async function anyNotebookReadable(
  ctx: QueryCtx,
  overviews: AsyncIterable<Doc<"audioOverviews">>,
  userId: Id<"users">,
  checked: Set<Id<"notebooks">>
): Promise<boolean> {
  for await (const overview of overviews) {
    if (checked.has(overview.notebookId)) continue;
    checked.add(overview.notebookId);
    if (await canReadNotebook(ctx, overview.notebookId, userId)) return true;
  }
  return false;
}

/**
 * True when the user can read the notebook of an audio overview backed by this stored file.
 * Overviews saved before `audioStorageId` existed only carry `audioUrl`, so when the storage-id
 * index finds no readable row, every spelling of the file's URL is checked too.
 */
export async function canReadAudioFile(
  ctx: QueryCtx,
  storageRef: string,
  userId: Id<"users">
): Promise<boolean> {
  const checked = new Set<Id<"notebooks">>();
  const storageId = ctx.db.system.normalizeId("_storage", storageRef);
  if (storageId) {
    const byStorageId = ctx.db
      .query("audioOverviews")
      .withIndex("by_audioStorageId", (q) => q.eq("audioStorageId", storageId));
    if (await anyNotebookReadable(ctx, byStorageId, userId, checked)) return true;
  }

  const urlSpellings = [storageRef, `/audio/${storageRef}`, `audio/${storageRef}`];
  const storageUrl = await storageUrlForRef(ctx, storageRef);
  if (storageUrl) urlSpellings.push(storageUrl);
  for (const audioUrl of urlSpellings) {
    const byUrl = ctx.db
      .query("audioOverviews")
      .withIndex("by_audioUrl", (q) => q.eq("audioUrl", audioUrl));
    if (await anyNotebookReadable(ctx, byUrl, userId, checked)) return true;
  }
  return false;
}

export async function getAudioOverview(
  ctx: QueryCtx,
  audioOverviewId: Id<"audioOverviews">
): Promise<Doc<"audioOverviews"> | null> {
  return await ctx.db.get("audioOverviews", audioOverviewId);
}

export async function listByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  userId?: Id<"users">
): Promise<Doc<"audioOverviews">[]> {
  const query = ctx.db
    .query("audioOverviews")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId));

  if (userId) {
    return await ctx.db
      .query("audioOverviews")
      .withIndex("by_notebook_and_user", (q) => q.eq("notebookId", notebookId).eq("userId", userId))
      .order("desc")
      .collect();
  }
  return await query.order("desc").collect();
}

export type AudioOverviewCreate = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  title: string;
  metadata?: unknown;
  status?: string;
};

export async function createAudioOverview(
  ctx: MutationCtx,
  data: AudioOverviewCreate
): Promise<Id<"audioOverviews">> {
  const now = Date.now();
  return await ctx.db.insert("audioOverviews", {
    userId: data.userId,
    notebookId: data.notebookId,
    title: data.title,
    status: data.status ?? "draft",
    metadata: data.metadata,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Create an audio overview and return the created document.
 */
export async function createAudioOverviewAndFetch(
  ctx: MutationCtx,
  data: AudioOverviewCreate
): Promise<Doc<"audioOverviews">> {
  const id = await createAudioOverview(ctx, data);
  const audioOverview = await getAudioOverview(ctx, id);
  if (!audioOverview) throw new Error("Failed to create audio overview");
  return audioOverview;
}

export type AudioOverviewUpdate = {
  title?: string;
  status?: string;
  transcript?: string;
  audioUrl?: string;
  metadata?: unknown;
};

export async function updateAudioOverview(
  ctx: MutationCtx,
  audioOverviewId: Id<"audioOverviews">,
  updates: AudioOverviewUpdate
): Promise<void> {
  await ctx.db.patch("audioOverviews", audioOverviewId, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function updateAudioOverviewStatus(
  ctx: MutationCtx,
  audioOverviewId: Id<"audioOverviews">,
  status: string
): Promise<void> {
  await ctx.db.patch("audioOverviews", audioOverviewId, {
    status,
    updatedAt: Date.now(),
  });
}

export async function updateAudioOverviewData(
  ctx: MutationCtx,
  audioOverviewId: Id<"audioOverviews">,
  transcript: string,
  audioUrl: string
): Promise<void> {
  await ctx.db.patch("audioOverviews", audioOverviewId, {
    transcript,
    audioUrl,
    status: "completed",
    updatedAt: Date.now(),
  });
}

export async function patchAudioOverview(
  ctx: MutationCtx,
  audioOverviewId: Id<"audioOverviews">,
  patch: Record<string, unknown>
): Promise<void> {
  await ctx.db.patch("audioOverviews", audioOverviewId, {
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function deleteAudioOverview(
  ctx: MutationCtx,
  audioOverviewId: Id<"audioOverviews">
): Promise<void> {
  await ctx.db.delete("audioOverviews", audioOverviewId);
}

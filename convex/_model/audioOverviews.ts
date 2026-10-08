import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canReadNotebook } from "../_lib/notebookAccess";

/**
 * Database operations for audio overviews.
 * No query/mutation/action exports — used by convex/audioOverviews.ts and jobs.
 */

/** Overviews checked per lookup; forks copy `audioUrl`, so one file can back a few rows. */
const AUDIO_FILE_OWNER_SCAN = 25;

/**
 * Storage reference inside a non-HTTP `audioUrl`: a bare storage id or a legacy
 * `/audio/<storageId>` path. Returns null for full URLs.
 */
export function storageRefFromAudioUrl(audioUrl: string): string | null {
  const raw = audioUrl.trim();
  if (!raw || raw.startsWith("http://") || raw.startsWith("https://")) return null;
  let ref = raw;
  if (ref.startsWith("/audio/")) ref = ref.slice("/audio/".length);
  else if (ref.startsWith("audio/")) ref = ref.slice("audio/".length);
  if (ref.startsWith("/")) ref = ref.slice(1);
  return ref || null;
}

/**
 * True when the user can read the notebook of an audio overview backed by this stored file.
 * Overviews saved before `audioStorageId` existed (and notebook forks) only carry `audioUrl`,
 * so every spelling of the file's URL is checked too.
 */
export async function canReadAudioFile(
  ctx: QueryCtx,
  storageRef: string,
  userId: Id<"users">
): Promise<boolean> {
  const storageId = ctx.db.system.normalizeId("_storage", storageRef);
  if (!storageId) return false;

  const byStorageId = await ctx.db
    .query("audioOverviews")
    .withIndex("by_audioStorageId", (q) => q.eq("audioStorageId", storageId))
    .take(AUDIO_FILE_OWNER_SCAN);

  const signedUrl = await ctx.storage.getUrl(storageId);
  const urlSpellings = [storageId, `/audio/${storageId}`, `audio/${storageId}`];
  if (signedUrl) urlSpellings.push(signedUrl);
  const byUrl = await Promise.all(
    urlSpellings.map((audioUrl) =>
      ctx.db
        .query("audioOverviews")
        .withIndex("by_audioUrl", (q) => q.eq("audioUrl", audioUrl))
        .take(AUDIO_FILE_OWNER_SCAN)
    )
  );

  const notebookIds = new Set([...byStorageId, ...byUrl.flat()].map((o) => o.notebookId));
  for (const notebookId of notebookIds) {
    if (await canReadNotebook(ctx, notebookId, userId)) return true;
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

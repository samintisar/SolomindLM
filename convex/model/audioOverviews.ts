import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

/**
 * Database operations for audio overviews.
 * No query/mutation/action exports — used by convex/audioOverviews.ts and jobs.
 */

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
    return await query.filter((q) => q.eq(q.field("userId"), userId)).order("desc").collect();
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

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

/**
 * Database operations for mindmaps.
 * No query/mutation/action exports — used by convex/mindmaps.ts and jobs.
 */

export async function getMindmap(
  ctx: QueryCtx,
  mindmapId: Id<"mindmaps">
): Promise<Doc<"mindmaps"> | null> {
  return await ctx.db.get("mindmaps", mindmapId);
}

export async function listByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  userId?: Id<"users">
): Promise<Doc<"mindmaps">[]> {
  const query = ctx.db
    .query("mindmaps")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId));

  if (userId) {
    return await ctx.db
      .query("mindmaps")
      .withIndex("by_notebook_and_user", (q) => q.eq("notebookId", notebookId).eq("userId", userId))
      .order("desc")
      .collect();
  }
  return await query.order("desc").collect();
}

export type MindmapCreate = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  title: string;
  data?: unknown;
  metadata?: unknown;
  status?: string;
};

export async function createMindmap(
  ctx: MutationCtx,
  data: MindmapCreate
): Promise<Id<"mindmaps">> {
  const now = Date.now();
  return await ctx.db.insert("mindmaps", {
    userId: data.userId,
    notebookId: data.notebookId,
    title: data.title,
    status: data.status ?? "draft",
    data: data.data ?? {},
    metadata: data.metadata,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Create a mindmap and return the created document.
 */
export async function createMindmapAndFetch(
  ctx: MutationCtx,
  data: MindmapCreate
): Promise<Doc<"mindmaps">> {
  const id = await createMindmap(ctx, data);
  const mindmap = await getMindmap(ctx, id);
  if (!mindmap) throw new Error("Failed to create mindmap");
  return mindmap;
}

export type MindmapUpdate = {
  title?: string;
  status?: string;
  data?: unknown;
  metadata?: unknown;
};

export async function updateMindmap(
  ctx: MutationCtx,
  mindmapId: Id<"mindmaps">,
  updates: MindmapUpdate
): Promise<void> {
  await ctx.db.patch("mindmaps", mindmapId, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function updateMindmapStatus(
  ctx: MutationCtx,
  mindmapId: Id<"mindmaps">,
  status: string
): Promise<void> {
  await ctx.db.patch("mindmaps", mindmapId, {
    status,
    updatedAt: Date.now(),
  });
}

export async function updateMindmapData(
  ctx: MutationCtx,
  mindmapId: Id<"mindmaps">,
  data: unknown
): Promise<void> {
  await ctx.db.patch("mindmaps", mindmapId, {
    data,
    status: "completed",
    updatedAt: Date.now(),
  });
}

export async function patchMindmap(
  ctx: MutationCtx,
  mindmapId: Id<"mindmaps">,
  patch: Record<string, unknown>
): Promise<void> {
  await ctx.db.patch("mindmaps", mindmapId, {
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function deleteMindmap(ctx: MutationCtx, mindmapId: Id<"mindmaps">): Promise<void> {
  await ctx.db.delete("mindmaps", mindmapId);
}

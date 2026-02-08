import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

/**
 * Database operations for notebooks.
 * No query/mutation/action exports — used by convex/notebooks.ts and jobs.
 */

export async function getNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<Doc<"notebooks"> | null> {
  return await ctx.db.get("notebooks", notebookId);
}

export async function getUserNotebooks(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<Doc<"notebooks">[]> {
  return await ctx.db
    .query("notebooks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
}

export async function getDocumentCountByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<number> {
  const documents = await ctx.db
    .query("documents")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .collect();
  return documents.length;
}

export type NotebookCreate = {
  userId: Id<"users">;
  title: string;
  coverColor?: string;
  icon?: string;
  isFeatured?: boolean;
  folderId?: Id<"folders">;
};

export async function createNotebook(
  ctx: MutationCtx,
  data: NotebookCreate
): Promise<Id<"notebooks">> {
  const now = Date.now();
  return await ctx.db.insert("notebooks", {
    userId: data.userId,
    title: data.title.trim(),
    coverColor: data.coverColor,
    icon: data.icon,
    isFeatured: data.isFeatured ?? false,
    folderId: data.folderId,
    createdAt: now,
    updatedAt: now,
  });
}

export type NotebookUpdate = {
  title?: string;
  coverColor?: string;
  icon?: string;
  isFeatured?: boolean;
  folderId?: Id<"folders">;
};

export async function updateNotebook(
  ctx: MutationCtx,
  notebookId: Id<"notebooks">,
  updates: NotebookUpdate
): Promise<void> {
  const updateData: Record<string, unknown> = {
    ...updates,
    updatedAt: Date.now(),
  };
  if (updates.title !== undefined) {
    updateData.title = updates.title.trim();
  }
  await ctx.db.patch("notebooks", notebookId, updateData);
}

export async function deleteNotebook(
  ctx: MutationCtx,
  notebookId: Id<"notebooks">
): Promise<void> {
  await ctx.db.delete("notebooks", notebookId);
}

export async function getReportsByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<Doc<"reports">[]> {
  return await ctx.db
    .query("reports")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .order("desc")
    .collect();
}

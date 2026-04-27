import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { MAX_DOCS_TO_COUNT } from "../_lib/queryCaps";

/**
 * Database operations for folders.
 * No query/mutation/action exports — used by convex/folders.ts and jobs.
 */

export async function getFolder(
  ctx: QueryCtx,
  folderId: Id<"folders">
): Promise<Doc<"folders"> | null> {
  return await ctx.db.get("folders", folderId);
}

export async function getUserFolders(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<Doc<"folders">[]> {
  return await ctx.db
    .query("folders")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(2000);
}

export async function getNotebookCountByFolder(
  ctx: QueryCtx,
  folderId: Id<"folders">
): Promise<number> {
  const notebooks = await ctx.db
    .query("notebooks")
    .withIndex("by_folder", (q) => q.eq("folderId", folderId))
    .take(MAX_DOCS_TO_COUNT + 1);
  return Math.min(notebooks.length, MAX_DOCS_TO_COUNT);
}

export async function getNotebooksInFolder(
  ctx: QueryCtx,
  folderId: Id<"folders">
): Promise<Doc<"notebooks">[]> {
  return await ctx.db
    .query("notebooks")
    .withIndex("by_folder", (q) => q.eq("folderId", folderId))
    .take(2000);
}

export type FolderCreate = {
  userId: Id<"users">;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
};

export async function createFolder(ctx: MutationCtx, data: FolderCreate): Promise<Id<"folders">> {
  const now = Date.now();
  return await ctx.db.insert("folders", {
    userId: data.userId,
    name: data.name.trim(),
    description: data.description,
    color: data.color ?? "bg-blue-500",
    icon: data.icon ?? "Folder",
    createdAt: now,
    updatedAt: now,
  });
}

export type FolderUpdate = {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
};

export async function updateFolder(
  ctx: MutationCtx,
  folderId: Id<"folders">,
  updates: FolderUpdate
): Promise<void> {
  const updateData: Record<string, unknown> = {
    ...updates,
    updatedAt: Date.now(),
  };
  if (updates.name !== undefined) {
    updateData.name = updates.name.trim();
  }
  await ctx.db.patch("folders", folderId, updateData);
}

export async function deleteFolder(ctx: MutationCtx, folderId: Id<"folders">): Promise<void> {
  await ctx.db.delete("folders", folderId);
}

/**
 * Remove folder association from all notebooks in a folder.
 * Call this before deleting the folder.
 */
export async function unlinkNotebooksFromFolder(
  ctx: MutationCtx,
  folderId: Id<"folders">
): Promise<void> {
  const notebooks = await getNotebooksInFolder(ctx, folderId);
  for (const notebook of notebooks) {
    await ctx.db.patch("notebooks", notebook._id, { folderId: undefined });
  }
}

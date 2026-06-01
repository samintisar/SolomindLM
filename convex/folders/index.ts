import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { MAX_DOCS_TO_COUNT } from "../_lib/queryCaps";
import * as Folders from "../_model/folders";
import { getAuthUserId } from "../auth";

/** Shape folder + notebook count for API response */
function toFolderDTO(
  folder: Pick<
    Doc<"folders">,
    "_id" | "name" | "description" | "color" | "icon" | "createdAt" | "updatedAt"
  >,
  notebookCount: number
) {
  return {
    id: folder._id,
    name: folder.name,
    description: folder.description,
    color: folder.color ?? "bg-vintage-brown-300",
    icon: folder.icon ?? "Folder",
    notebookCount,
    created_at: folder.createdAt,
    updated_at: folder.updatedAt,
  };
}

/**
 * Get all folders for the authenticated user with notebook counts
 */
export const list = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const folders = await Folders.getUserFolders(ctx, userId);

    // Get notebook counts for each folder
    const foldersWithCounts = await Promise.all(
      folders.map(async (folder) => {
        const notebookCount = await Folders.getNotebookCountByFolder(ctx, folder._id);
        return toFolderDTO(folder, notebookCount);
      })
    );

    return foldersWithCounts;
  },
});

/**
 * Get a specific folder by ID
 */
export const get = query({
  args: { id: v.id("folders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const folder = await Folders.getFolder(ctx, args.id);
    if (!folder || folder.userId !== userId) return null;

    const notebookCount = await Folders.getNotebookCountByFolder(ctx, folder._id);
    return toFolderDTO(folder, notebookCount);
  },
});

/**
 * Get all notebooks in a specific folder
 */
export const getNotebooks = query({
  args: { folderId: v.id("folders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    // Verify folder exists and belongs to user
    const folder = await Folders.getFolder(ctx, args.folderId);
    if (!folder || folder.userId !== userId) return [];

    const notebooks = await Folders.getNotebooksInFolder(ctx, args.folderId);

    // Get source counts for each notebook
    const notebooksWithCounts = await Promise.all(
      notebooks.map(async (notebook) => {
        const docBatch = await ctx.db
          .query("documents")
          .withIndex("by_notebook", (q) => q.eq("notebookId", notebook._id))
          .take(MAX_DOCS_TO_COUNT + 1);
        const sourceCount =
          docBatch.length > MAX_DOCS_TO_COUNT ? MAX_DOCS_TO_COUNT : docBatch.length;

        return {
          id: notebook._id,
          title: notebook.title,
          date: new Date(notebook.updatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          sourceCount,
          coverColor: notebook.coverColor ?? "bg-vintage-brown-300",
          icon: notebook.icon ?? "Folder",
          isFeatured: notebook.isFeatured ?? false,
          folderId: notebook.folderId,
          created_at: notebook.createdAt,
          updated_at: notebook.updatedAt,
        };
      })
    );

    return notebooksWithCounts;
  },
});

/**
 * Create a new folder
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const folderId = await Folders.createFolder(ctx, {
      userId,
      name: args.name,
      description: args.description,
      color: args.color,
      icon: args.icon,
    });

    const now = Date.now();
    return {
      id: folderId,
      name: args.name,
      description: args.description,
      color: args.color ?? "bg-vintage-brown-300",
      icon: args.icon ?? "Folder",
      notebookCount: 0,
      created_at: now,
      updated_at: now,
    };
  },
});

/**
 * Update a folder
 */
export const update = mutation({
  args: {
    id: v.id("folders"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const { id, ...updates } = args;

    // Verify ownership
    const existing = await Folders.getFolder(ctx, id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Folder not found");
    }

    await Folders.updateFolder(ctx, id, updates);

    // Get updated folder and notebook count
    const updated = await Folders.getFolder(ctx, id);
    if (!updated) throw new Error("Folder not found");

    const notebookCount = await Folders.getNotebookCountByFolder(ctx, id);
    return toFolderDTO(updated, notebookCount);
  },
});

/**
 * Delete a folder (notebooks will have folderId set to undefined)
 */
export const remove = mutation({
  args: { id: v.id("folders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Verify ownership
    const existing = await Folders.getFolder(ctx, args.id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Folder not found");
    }

    // Unlink notebooks from folder
    await Folders.unlinkNotebooksFromFolder(ctx, args.id);

    // Delete the folder
    await Folders.deleteFolder(ctx, args.id);

    return { message: "Folder deleted successfully" };
  },
});

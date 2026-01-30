import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "./auth";

/**
 * Get all folders for the authenticated user with notebook counts
 */
export const list = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const folders = await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    // Get notebook counts for each folder
    const foldersWithCounts = await Promise.all(
      folders.map(async (folder) => {
        const notebooks = await ctx.db
          .query("notebooks")
          .withIndex("by_folder", (q) => q.eq("folderId", folder._id))
          .collect();

        return {
          id: folder._id,
          name: folder.name,
          description: folder.description,
          color: folder.color || "bg-blue-500",
          icon: folder.icon || "Folder",
          notebookCount: notebooks.length,
          created_at: folder.createdAt,
          updated_at: folder.updatedAt,
        };
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

    const folder = await ctx.db.get(args.id);

    if (!folder || folder.userId !== userId) {
      return null;
    }

    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_folder", (q) => q.eq("folderId", folder._id))
      .collect();

    return {
      id: folder._id,
      name: folder.name,
      description: folder.description,
      color: folder.color || "bg-blue-500",
      icon: folder.icon || "Folder",
      notebookCount: notebooks.length,
      created_at: folder.createdAt,
      updated_at: folder.updatedAt,
    };
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
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== userId) {
      return [];
    }

    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();

    // Get source counts for each notebook
    const notebooksWithCounts = await Promise.all(
      notebooks.map(async (notebook) => {
        const documents = await ctx.db
          .query("documents")
          .withIndex("by_notebook", (q) => q.eq("notebookId", notebook._id))
          .collect();

        return {
          id: notebook._id,
          title: notebook.title,
          date: new Date(notebook.updatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          sourceCount: documents.length,
          coverColor: notebook.coverColor || "bg-yellow-500",
          icon: notebook.icon || "Folder",
          isFeatured: notebook.isFeatured || false,
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

    const now = Date.now();

    const folderId = await ctx.db.insert("folders", {
      userId,
      name: args.name.trim(),
      description: args.description,
      color: args.color || "bg-blue-500",
      icon: args.icon || "Folder",
      createdAt: now,
      updatedAt: now,
    });

    return {
      id: folderId,
      name: args.name,
      description: args.description,
      color: args.color || "bg-blue-500",
      icon: args.icon || "Folder",
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
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Folder not found");
    }

    const updateData: any = {
      ...updates,
      updatedAt: Date.now(),
    };

    if (updates.name) {
      updateData.name = updates.name.trim();
    }

    await ctx.db.patch(id, updateData);

    // Get notebook count
    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_folder", (q) => q.eq("folderId", id))
      .collect();

    return {
      id,
      name: updateData.name || existing.name,
      description: updateData.description ?? existing.description,
      color: updateData.color || existing.color || "bg-blue-500",
      icon: updateData.icon || existing.icon || "Folder",
      notebookCount: notebooks.length,
      created_at: existing.createdAt,
      updated_at: updateData.updatedAt,
    };
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
    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Folder not found");
    }

    // Set folderId to undefined for all notebooks in this folder
    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_folder", (q) => q.eq("folderId", args.id))
      .collect();

    for (const notebook of notebooks) {
      await ctx.db.patch(notebook._id, { folderId: undefined });
    }

    // Delete the folder
    await ctx.db.delete(args.id);

    return { message: "Folder deleted successfully" };
  },
});

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { checkNotebookLimit } from "./lib/limits";

/**
 * Get all notebooks for the authenticated user with source counts
 */
export const list = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
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
 * Get a specific notebook by ID
 */
export const get = query({
  args: { id: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const notebook = await ctx.db.get(args.id);

    if (!notebook || notebook.userId !== userId) {
      return null;
    }

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
  },
});

/**
 * Create a new notebook
 */
export const create = mutation({
  args: {
    title: v.string(),
    coverColor: v.optional(v.string()),
    icon: v.optional(v.string()),
    isFeatured: v.optional(v.boolean()),
    folderId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Check notebook limit
    await checkNotebookLimit(ctx);

    const now = Date.now();

    const notebookId = await ctx.db.insert("notebooks", {
      userId,
      title: args.title.trim(),
      coverColor: args.coverColor,
      icon: args.icon,
      isFeatured: args.isFeatured || false,
      folderId: args.folderId,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id: notebookId,
      title: args.title,
      date: new Date(now).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      sourceCount: 0,
      coverColor: args.coverColor || "bg-yellow-500",
      icon: args.icon || "Folder",
      isFeatured: args.isFeatured || false,
      folderId: args.folderId,
      created_at: now,
      updated_at: now,
    };
  },
});

/**
 * Update a notebook
 */
export const update = mutation({
  args: {
    id: v.id("notebooks"),
    title: v.optional(v.string()),
    coverColor: v.optional(v.string()),
    icon: v.optional(v.string()),
    isFeatured: v.optional(v.boolean()),
    folderId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const { id, ...updates } = args;

    // Verify ownership
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Notebook not found");
    }

    const updateData: any = {
      ...updates,
      updatedAt: Date.now(),
    };

    if (updates.title) {
      updateData.title = updates.title.trim();
    }

    await ctx.db.patch(id, updateData);

    // Get updated notebook with count
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", id))
      .collect();

    return {
      id,
      title: updateData.title || existing.title,
      date: new Date(updateData.updatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      sourceCount: documents.length,
      coverColor: updateData.coverColor || existing.coverColor || "bg-yellow-500",
      icon: updateData.icon || existing.icon || "Folder",
      isFeatured: updateData.isFeatured ?? existing.isFeatured,
      folderId: updateData.folderId ?? existing.folderId,
      created_at: existing.createdAt,
      updated_at: updateData.updatedAt,
    };
  },
});

/**
 * Delete a notebook
 */
export const remove = mutation({
  args: { id: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Verify ownership
    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Notebook not found");
    }

    await ctx.db.delete(args.id);

    return { message: "Notebook deleted successfully" };
  },
});

/**
 * Get all reports for a notebook
 */
export const getReports = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    // Verify user owns the notebook
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      return [];
    }

    const reports = await ctx.db
      .query("reports")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .order("desc")
      .collect();

    return reports;
  },
});

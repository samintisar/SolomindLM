import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getAuthUserId } from "./auth";
import { checkNotebookLimit } from "./lib/limits";
import * as Notebooks from "./model/notebooks";

/** Shape notebook + source count for API response */
function toNotebookDTO(
  notebook: Pick<
    Doc<"notebooks">,
    "_id" | "title" | "updatedAt" | "coverColor" | "icon" | "isFeatured" | "folderId" | "createdAt"
  >,
  sourceCount: number
) {
  return {
    id: notebook._id,
    title: notebook.title,
    date: new Date(notebook.updatedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    sourceCount,
    coverColor: notebook.coverColor ?? "bg-yellow-500",
    icon: notebook.icon ?? "Folder",
    isFeatured: notebook.isFeatured ?? false,
    folderId: notebook.folderId,
    created_at: notebook.createdAt,
    updated_at: notebook.updatedAt,
  };
}

/**
 * Get all notebooks for the authenticated user with source counts
 */
export const list = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const notebooks = await Notebooks.getUserNotebooks(ctx, userId);
    const notebooksWithCounts = await Promise.all(
      notebooks.map(async (notebook) => {
        const sourceCount = await Notebooks.getDocumentCountByNotebook(ctx, notebook._id);
        return toNotebookDTO(notebook, sourceCount);
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

    const notebook = await Notebooks.getNotebook(ctx, args.id);
    if (!notebook || notebook.userId !== userId) return null;

    const sourceCount = await Notebooks.getDocumentCountByNotebook(ctx, notebook._id);
    return toNotebookDTO(notebook, sourceCount);
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

    await checkNotebookLimit(ctx);

    const notebookId = await Notebooks.createNotebook(ctx, {
      userId,
      title: args.title,
      coverColor: args.coverColor,
      icon: args.icon,
      isFeatured: args.isFeatured,
      folderId: args.folderId,
    });

    const now = Date.now();
    return {
      id: notebookId,
      title: args.title,
      date: new Date(now).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      sourceCount: 0,
      coverColor: args.coverColor ?? "bg-yellow-500",
      icon: args.icon ?? "Folder",
      isFeatured: args.isFeatured ?? false,
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

    const existing = await Notebooks.getNotebook(ctx, id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Notebook not found");
    }

    await Notebooks.updateNotebook(ctx, id, updates);

    const updated = await Notebooks.getNotebook(ctx, id);
    const sourceCount = await Notebooks.getDocumentCountByNotebook(ctx, id);
    if (!updated) throw new Error("Notebook not found");

    return toNotebookDTO(updated, sourceCount);
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

    const existing = await Notebooks.getNotebook(ctx, args.id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Notebook not found");
    }

    await Notebooks.deleteNotebook(ctx, args.id);
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

    const notebook = await Notebooks.getNotebook(ctx, args.notebookId);
    if (!notebook || notebook.userId !== userId) return [];

    return await Notebooks.getReportsByNotebook(ctx, args.notebookId);
  },
});

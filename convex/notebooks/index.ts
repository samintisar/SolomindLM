import { v } from "convex/values";
import { mutation, query, internalQuery } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { getAuthUserId } from "../auth";
import { checkNotebookLimit } from "../_lib/limits";
import { getNotebookAccess } from "../_lib/notebookAccess";
import * as Notebooks from "../_model/notebooks";

/** Shape notebook + source count for API response */
function toNotebookDTO(
  notebook: Pick<
    Doc<"notebooks">,
    | "_id"
    | "title"
    | "updatedAt"
    | "coverColor"
    | "icon"
    | "isFeatured"
    | "folderId"
    | "createdAt"
    | "chatSettings"
  >,
  sourceCount: number,
  options?: { isSharedNotebook?: boolean }
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
    coverColor: notebook.coverColor ?? "bg-vintage-brown-300",
    icon: notebook.icon ?? "Folder",
    isFeatured: notebook.isFeatured ?? false,
    folderId: notebook.folderId,
    created_at: notebook.createdAt,
    updated_at: notebook.updatedAt,
    isSharedNotebook: options?.isSharedNotebook ?? false,
    chatSettings: notebook.chatSettings ?? undefined,
  };
}

/**
 * Get all notebooks for the authenticated user with source counts
 */
export const list = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const owned = await Notebooks.getUserNotebooks(ctx, userId);
    const ownedDtos = await Promise.all(
      owned.map(async (notebook) => {
        const sourceCount = await Notebooks.getDocumentCountByNotebook(ctx, notebook._id);
        return toNotebookDTO(notebook, sourceCount, { isSharedNotebook: false });
      })
    );

    const memberships = await ctx.db
      .query("notebookMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const sharedDtos: ReturnType<typeof toNotebookDTO>[] = [];
    for (const m of memberships) {
      const notebook = await ctx.db.get(m.notebookId);
      if (!notebook) continue;
      const sourceCount = await Notebooks.getDocumentCountByNotebook(ctx, notebook._id);
      sharedDtos.push(toNotebookDTO(notebook, sourceCount, { isSharedNotebook: true }));
    }

    const merged = [...ownedDtos, ...sharedDtos];
    merged.sort((a, b) => b.updated_at - a.updated_at);
    return merged;
  },
});

/**
 * Internal: Get notebooks for a specific user (for caching)
 */
export const listInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const notebooks = await Notebooks.getUserNotebooks(ctx, args.userId);
    const notebooksWithCounts = await Promise.all(
      notebooks.map(async (notebook) => {
        const sourceCount = await Notebooks.getDocumentCountByNotebook(ctx, notebook._id);
        return toNotebookDTO(notebook, sourceCount);
      })
    );
    return notebooksWithCounts;
  },
});

/** For actions: check edit access without throwing. */
export const canEditNotebookInternal = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const access = await getNotebookAccess(ctx, args.notebookId, args.userId);
    return access === "owner" || access === "editor";
  },
});

export const canReadNotebookInternal = internalQuery({
  args: {
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const access = await getNotebookAccess(ctx, args.notebookId, args.userId);
    return access !== null;
  },
});

export const getNotebookInternal = internalQuery({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.notebookId);
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
    if (!notebook) return null;

    const access = await getNotebookAccess(ctx, args.id, userId);
    if (!access) return null;

    const sourceCount = await Notebooks.getDocumentCountByNotebook(ctx, notebook._id);
    return toNotebookDTO(notebook, sourceCount, {
      isSharedNotebook: access === "editor",
    });
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
      coverColor: args.coverColor ?? "bg-vintage-brown-300",
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
    chatSettings: v.optional(
      v.object({
        instructionMode: v.union(
          v.literal("default"),
          v.literal("learningGuide"),
          v.literal("custom")
        ),
        customInstructions: v.optional(v.string()),
        responseLength: v.union(v.literal("default"), v.literal("longer"), v.literal("shorter")),
        smartModel: v.optional(v.string()),
      })
    ),
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

    await Notebooks.removeNotebookWithRelated(ctx, args.id);
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

    const access = await getNotebookAccess(ctx, args.notebookId, userId);
    if (!access) return [];

    return await Notebooks.getReportsByNotebook(ctx, args.notebookId);
  },
});

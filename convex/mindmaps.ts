import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";

/**
 * List all mindmaps for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("mindmaps")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get a specific mindmap by ID
 */
export const get = query({
  args: { id: v.id("mindmaps") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const mindmap = await ctx.db.get(args.id);

    if (!mindmap || mindmap.userId !== userId) {
      return null;
    }

    return mindmap;
  },
});

/**
 * Create a new mindmap
 */
export const create = mutation({
  args: {
    notebookId: v.id("notebooks"),
    title: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      throw new Error("Notebook not found");
    }

    const mindmapId = await ctx.db.insert("mindmaps", {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      status: "draft",
      data: {},
      metadata: args.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return await ctx.db.get(mindmapId);
  },
});

/**
 * Update a mindmap
 */
export const update = mutation({
  args: {
    id: v.id("mindmaps"),
    title: v.optional(v.string()),
    data: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const { id, ...updates } = args;

    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Mindmap not found");
    }

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

/**
 * Delete a mindmap
 */
export const remove = mutation({
  args: { id: v.id("mindmaps") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const mindmap = await ctx.db.get(args.id);
    if (!mindmap || mindmap.userId !== userId) {
      throw new Error("Mindmap not found");
    }

    await ctx.db.delete(args.id);

    return { message: "Mindmap deleted successfully" };
  },
});

/**
 * Generate a mindmap for a notebook
 */
export const generateMindMap = mutation({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const { notebookId, documentIds, title } = args;
    if (documentIds.length === 0) {
      throw new Error("Please select at least one source. Content generation uses only your selected sources.");
    }

    // Create mindmap record
    const mindmapId = await ctx.db.insert("mindmaps", {
      userId,
      notebookId,
      title: title || "Mind Map",
      data: {},
      status: "generating",
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Schedule the generation job
    await ctx.scheduler.runAfter(0, internal.jobs.MindMapGenerationJob.mindmapGeneration, {
      mindmapId,
      userId,
      notebookId,
      documentIds,
    });

    return mindmapId;
  },
});

/**
 * Update a mindmap
 */
export const updateMindMap = mutation({
  args: {
    mindmapId: v.id("mindmaps"),
    data: v.optional(v.any()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const { mindmapId, data, title } = args;

    // Verify ownership
    const mindmap = await ctx.db.get(mindmapId);
    if (!mindmap || mindmap.userId !== userId) {
      throw new Error("Mindmap not found or access denied");
    }

    // Update
    const updates: any = { updatedAt: Date.now() };
    if (data !== undefined) updates.data = data;
    if (title !== undefined) updates.title = title;

    await ctx.db.patch(mindmapId, updates);

    return mindmapId;
  },
});

/**
 * Delete a mindmap
 */
export const deleteMindMap = mutation({
  args: {
    mindmapId: v.id("mindmaps"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Verify ownership
    const mindmap = await ctx.db.get(args.mindmapId);
    if (!mindmap || mindmap.userId !== userId) {
      throw new Error("Mindmap not found or access denied");
    }

    await ctx.db.delete(args.mindmapId);
  },
});

/**
 * Internal: Update mindmap status
 */
export const updateStatus = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mindmapId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update mindmap data
 */
export const updateData = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mindmapId, {
      data: args.data,
      status: "completed",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update mindmap with partial updates
 */
export const patch = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mindmapId, {
      ...args.patch,
      updatedAt: Date.now(),
    });
  },
});

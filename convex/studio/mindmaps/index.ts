import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { getAuthUserId } from "../../auth";
import { assertCanEditNotebook, assertCanReadNotebook } from "../../_lib/notebookAccess";
import * as Mindmaps from "../../_model/mindmaps";

/**
 * List all mindmaps for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    await assertCanReadNotebook(ctx, args.notebookId, userId);
    return await Mindmaps.listByNotebook(ctx, args.notebookId);
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

    const mindmap = await Mindmaps.getMindmap(ctx, args.id);

    if (!mindmap) {
      return null;
    }

    try {
      await assertCanReadNotebook(ctx, mindmap.notebookId, userId);
    } catch {
      return null;
    }

    return mindmap;
  },
});

/**
 * Internal: Get a mindmap by ID (for use by jobs)
 */
export const getInternal = internalQuery({
  args: { id: v.id("mindmaps") },
  handler: async (ctx, args) => {
    return await Mindmaps.getMindmap(ctx, args.id);
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

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    return await Mindmaps.createMindmapAndFetch(ctx, {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      data: {},
      metadata: args.metadata,
    });
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

    const existing = await Mindmaps.getMindmap(ctx, id);
    if (!existing) {
      throw new Error("Mindmap not found");
    }

    await assertCanEditNotebook(ctx, existing.notebookId, userId);

    await Mindmaps.updateMindmap(ctx, id, updates);

    return await Mindmaps.getMindmap(ctx, id);
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

    const mindmap = await Mindmaps.getMindmap(ctx, args.id);
    if (!mindmap) {
      throw new Error("Mindmap not found");
    }

    await assertCanEditNotebook(ctx, mindmap.notebookId, userId);

    await Mindmaps.deleteMindmap(ctx, args.id);

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
      throw new Error(
        "Please select at least one source. Content generation uses only your selected sources."
      );
    }

    await assertCanEditNotebook(ctx, notebookId, userId);

    // Create mindmap record
    const mindmapId = await Mindmaps.createMindmap(ctx, {
      userId,
      notebookId,
      title: title || "Mind Map",
      data: {},
      metadata: {},
      status: "generating",
    });

    // Schedule the generation job
    await ctx.scheduler.runAfter(0, internal.studio.mindmaps.job.mindmapGeneration, {
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

    const mindmap = await Mindmaps.getMindmap(ctx, mindmapId);
    if (!mindmap) {
      throw new Error("Mindmap not found or access denied");
    }

    await assertCanEditNotebook(ctx, mindmap.notebookId, userId);

    // Update
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (data !== undefined) updates.data = data;
    if (title !== undefined) updates.title = title;

    await Mindmaps.updateMindmap(ctx, mindmapId, updates);

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

    const mindmap = await Mindmaps.getMindmap(ctx, args.mindmapId);
    if (!mindmap) {
      throw new Error("Mindmap not found or access denied");
    }

    await assertCanEditNotebook(ctx, mindmap.notebookId, userId);

    await Mindmaps.deleteMindmap(ctx, args.mindmapId);
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
    await Mindmaps.updateMindmapStatus(ctx, args.mindmapId, args.status);
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
    await Mindmaps.updateMindmapData(ctx, args.mindmapId, args.data);
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
    await Mindmaps.patchMindmap(ctx, args.mindmapId, args.patch);
  },
});

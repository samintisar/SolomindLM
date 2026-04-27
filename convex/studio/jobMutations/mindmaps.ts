import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { buildErrorMetadata } from "./jobErrorUtils";

export const saveMindMapResults = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    mindmap: v.any(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mindmapId, {
      data: args.mindmap,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Mind Map",
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
  },
});

export const updateMindMapTitle = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mindmapId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const updateMindMapStatus = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.mindmapId, updates);
  },
});

export const markMindMapFailed = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    await ctx.db.patch(args.mindmapId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});

// Multi-phase mindmap helpers
export const initMindMapMapPhase = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    totalMapTasks: v.number(),
  },
  handler: async (ctx, args) => {
    const mindmap = await ctx.db.get(args.mindmapId);
    if (!mindmap) return null;

    await ctx.db.patch(args.mindmapId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...mindmap.metadata,
        phase: "map_processing",
        progress: 30,
        currentStep: "Processing content...",
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
      },
    });
    return args.mindmapId;
  },
});

export const storeMindMapMapResult = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const mindmap = await ctx.db.get(args.mindmapId);
    if (!mindmap) return null;

    const existingResults = mindmap.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = mindmap.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.mindmapId, {
      updatedAt: Date.now(),
      metadata: {
        ...mindmap.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.mindmapId;
  },
});

export const clearMindMapMapData = internalMutation({
  args: {
    mindmapId: v.id("mindmaps"),
  },
  handler: async (ctx, args) => {
    const mindmap = await ctx.db.get(args.mindmapId);
    if (!mindmap) return null;

    const { mapResults: _mapResults, ...restMetadata } = mindmap.metadata || {};
    await ctx.db.patch(args.mindmapId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.mindmapId;
  },
});

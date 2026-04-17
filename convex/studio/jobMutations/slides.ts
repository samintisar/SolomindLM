import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { buildErrorMetadata } from "./jobErrorUtils";

export const saveSlideDeckResults = internalMutation({
  args: {
    slideDeckId: v.id("slides"),
    slides: v.array(v.any()),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.slideDeckId, {
      data: args.slides,
      status: "completed",
      slideCount: args.slides.length,
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Slide Deck",
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
  },
});

export const updateSlideDeckTitle = internalMutation({
  args: {
    slideDeckId: v.id("slides"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.slideDeckId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const updateSlideDeckStatus = internalMutation({
  args: {
    slideDeckId: v.id("slides"),
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
    await ctx.db.patch(args.slideDeckId, updates);
  },
});

export const markSlideDeckFailed = internalMutation({
  args: {
    slideDeckId: v.id("slides"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    await ctx.db.patch(args.slideDeckId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});

// Multi-phase slide deck helpers
export const initSlideDeckMapPhase = internalMutation({
  args: {
    slideDeckId: v.id("slides"),
    totalMapTasks: v.number(),
    slideCount: v.number(),
  },
  handler: async (ctx, args) => {
    const slideDeck = await ctx.db.get(args.slideDeckId);
    if (!slideDeck) return null;

    await ctx.db.patch(args.slideDeckId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...slideDeck.metadata,
        phase: "map_processing",
        progress: 30,
        currentStep: "Processing content...",
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
        slideCount: args.slideCount,
      },
    });
    return args.slideDeckId;
  },
});

export const storeSlideDeckMapResult = internalMutation({
  args: {
    slideDeckId: v.id("slides"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const slideDeck = await ctx.db.get(args.slideDeckId);
    if (!slideDeck) return null;

    const existingResults = slideDeck.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = slideDeck.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.slideDeckId, {
      updatedAt: Date.now(),
      metadata: {
        ...slideDeck.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.slideDeckId;
  },
});

export const clearSlideDeckMapData = internalMutation({
  args: {
    slideDeckId: v.id("slides"),
  },
  handler: async (ctx, args) => {
    const slideDeck = await ctx.db.get(args.slideDeckId);
    if (!slideDeck) return null;

    const { mapResults, ...restMetadata } = slideDeck.metadata || {};
    await ctx.db.patch(args.slideDeckId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.slideDeckId;
  },
});

import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { normalizeMathMarkdown } from "../../_shared/mathMarkdown";
import { buildErrorMetadata } from "./jobErrorUtils";

export const saveAudioOverviewResults = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    audioUrl: v.string(),
    transcript: v.string(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    const normalizedTranscript = normalizeMathMarkdown(args.transcript);

    await ctx.db.patch(args.audioOverviewId, {
      transcript: normalizedTranscript,
      audioUrl: args.audioUrl,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Audio Overview",
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
  },
});

export const updateAudioOverviewTitle = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.audioOverviewId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const updateAudioOverviewStatus = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.audioOverviewId, updates);
  },
});

export const markAudioOverviewFailed = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    await ctx.db.patch(args.audioOverviewId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});

// Multi-phase audio overview helpers
export const initAudioOverviewMapPhase = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    totalMapTasks: v.number(),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview) return null;

    await ctx.db.patch(args.audioOverviewId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...audioOverview.metadata,
        phase: "map_processing",
        progress: 30,
        currentStep: "Processing content...",
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
      },
    });
    return args.audioOverviewId;
  },
});

export const storeAudioOverviewMapResult = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview) return null;

    const existingResults = audioOverview.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = audioOverview.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.audioOverviewId, {
      updatedAt: Date.now(),
      metadata: {
        ...audioOverview.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.audioOverviewId;
  },
});

export const clearAudioOverviewMapData = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview) return null;

    const { mapResults: _mapResults, ...restMetadata } = audioOverview.metadata || {};
    await ctx.db.patch(args.audioOverviewId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.audioOverviewId;
  },
});

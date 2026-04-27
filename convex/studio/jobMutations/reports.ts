import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { normalizeMathMarkdown, normalizeMathMarkdownDeep } from "../../_shared/mathMarkdown";
import { buildErrorMetadata } from "./jobErrorUtils";

export const saveReportResults = internalMutation({
  args: {
    reportId: v.id("reports"),
    content: v.any(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    const normalizedContent =
      typeof args.content === "string"
        ? normalizeMathMarkdown(args.content)
        : normalizeMathMarkdownDeep(args.content);

    await ctx.db.patch(args.reportId, {
      content: normalizedContent,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Report",
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
    return args.reportId;
  },
});

export const updateReportTitle = internalMutation({
  args: {
    reportId: v.id("reports"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    await ctx.db.patch(args.reportId, {
      title: args.title,
      updatedAt: Date.now(),
    });
    return args.reportId;
  },
});

export const updateReportStatus = internalMutation({
  args: {
    reportId: v.id("reports"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    const updates: any = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      updates.metadata = args.metadata;
    }
    await ctx.db.patch(args.reportId, updates);
    return args.reportId;
  },
});

export const markReportFailed = internalMutation({
  args: {
    reportId: v.id("reports"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { reportId, error, metadata } = args;
    const report = await ctx.db.get(reportId);
    if (!report) return null;

    const errorMetadata = buildErrorMetadata(
      error,
      metadata?.errorPhase || metadata?.phase || "unknown",
      metadata
    );

    await ctx.db.patch(reportId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...metadata,
        ...errorMetadata,
      },
    });
    return reportId;
  },
});

// Multi-phase report helpers
export const initReportMapPhase = internalMutation({
  args: {
    reportId: v.id("reports"),
    totalMapTasks: v.number(),
    reportType: v.string(),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    await ctx.db.patch(args.reportId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...report.metadata,
        phase: "map_processing",
        progress: 30,
        currentStep: "Processing content...",
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
        reportType: args.reportType,
        customPrompt: args.customPrompt,
      },
    });
    return args.reportId;
  },
});

export const storeReportMapResult = internalMutation({
  args: {
    reportId: v.id("reports"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    const existingResults = report.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = report.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.reportId, {
      updatedAt: Date.now(),
      metadata: {
        ...report.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.reportId;
  },
});

export const clearReportMapData = internalMutation({
  args: {
    reportId: v.id("reports"),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    const { packedChunks: _packedChunks, mapResults: _mapResults, ...restMetadata } = report.metadata || {};
    await ctx.db.patch(args.reportId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.reportId;
  },
});

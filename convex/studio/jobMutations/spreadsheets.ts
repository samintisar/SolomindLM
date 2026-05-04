import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { buildErrorMetadata } from "./jobErrorUtils";

export const saveSpreadsheetResults = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    spreadsheet: v.any(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.spreadsheetId, {
      data: args.spreadsheet,
      status: "completed",
      updatedAt: Date.now(),
      title: args.metadata?.title ?? "Spreadsheet",
      metadata: {
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
  },
});

export const updateSpreadsheetTitle = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.spreadsheetId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const updateSpreadsheetStatus = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
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
    await ctx.db.patch(args.spreadsheetId, updates);
  },
});

export const markSpreadsheetFailed = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    await ctx.db.patch(args.spreadsheetId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});

// Multi-phase spreadsheet helpers
export const initSpreadsheetMapPhase = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    totalMapTasks: v.number(),
    spreadsheetType: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const spreadsheet = await ctx.db.get(args.spreadsheetId);
    if (!spreadsheet) return null;

    await ctx.db.patch(args.spreadsheetId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...spreadsheet.metadata,
        phase: "map_processing",
        progress: 30,
        currentStep: "Processing content...",
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
        spreadsheetType: args.spreadsheetType || "custom",
        customPrompt: args.customPrompt,
      },
    });
    return args.spreadsheetId;
  },
});

export const storeSpreadsheetMapResult = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const spreadsheet = await ctx.db.get(args.spreadsheetId);
    if (!spreadsheet) return null;

    const existingResults = spreadsheet.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = spreadsheet.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.spreadsheetId, {
      updatedAt: Date.now(),
      metadata: {
        ...spreadsheet.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.spreadsheetId;
  },
});

export const clearSpreadsheetMapData = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
  },
  handler: async (ctx, args) => {
    const spreadsheet = await ctx.db.get(args.spreadsheetId);
    if (!spreadsheet) return null;

    const { mapResults: _mapResults, ...restMetadata } = spreadsheet.metadata || {};
    await ctx.db.patch(args.spreadsheetId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.spreadsheetId;
  },
});

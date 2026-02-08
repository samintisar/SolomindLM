import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";
import * as Notebooks from "./model/notebooks";
import * as Spreadsheets from "./model/spreadsheets";

export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await Spreadsheets.listByNotebook(ctx, args.notebookId, userId);
  },
});

export const get = query({
  args: { id: v.id("spreadsheets") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const spreadsheet = await Spreadsheets.getSpreadsheet(ctx, args.id);
    if (!spreadsheet || spreadsheet.userId !== userId) return null;
    return spreadsheet;
  },
});

export const create = mutation({
  args: {
    notebookId: v.id("notebooks"),
    title: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const notebook = await Notebooks.getNotebook(ctx, args.notebookId);
    if (!notebook || notebook.userId !== userId) throw new Error("Notebook not found");
    return await Spreadsheets.createSpreadsheetAndFetch(ctx, {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      metadata: args.metadata,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("spreadsheets"),
    title: v.optional(v.string()),
    data: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const { id, ...updates } = args;
    const existing = await Spreadsheets.getSpreadsheet(ctx, id);
    if (!existing || existing.userId !== userId) throw new Error("Spreadsheet not found");
    await Spreadsheets.updateSpreadsheet(ctx, id, updates);
    return await Spreadsheets.getSpreadsheet(ctx, id);
  },
});

export const remove = mutation({
  args: { id: v.id("spreadsheets") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const spreadsheet = await Spreadsheets.getSpreadsheet(ctx, args.id);
    if (!spreadsheet || spreadsheet.userId !== userId) throw new Error("Spreadsheet not found");
    await Spreadsheets.deleteSpreadsheet(ctx, args.id);
    return { message: "Spreadsheet deleted successfully" };
  },
});

export const generateSpreadsheet = mutation({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.array(v.id("documents")),
    title: v.optional(v.string()),
    spreadsheetType: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const { notebookId, documentIds, title, spreadsheetType, customPrompt } = args;
    if (documentIds.length === 0) {
      throw new Error("Please select at least one source. Content generation uses only your selected sources.");
    }
    const spreadsheetId = await Spreadsheets.createSpreadsheet(ctx, {
      userId,
      notebookId,
      title: title || "Spreadsheet",
      data: {},
      metadata: {
        spreadsheetType: spreadsheetType || 'custom',
        customPrompt: customPrompt || '',
      },
      status: "generating",
    });
    await ctx.scheduler.runAfter(0, internal.jobs.SpreadsheetGenerationJob.spreadsheetGeneration, {
      spreadsheetId,
      userId,
      notebookId,
      documentIds,
      spreadsheetType: spreadsheetType || 'custom',
      customPrompt: customPrompt || '',
    });
    return spreadsheetId;
  },
});

export const updateSpreadsheet = mutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    data: v.optional(v.any()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const { spreadsheetId, data, title } = args;
    const spreadsheet = await Spreadsheets.getSpreadsheet(ctx, spreadsheetId);
    if (!spreadsheet || spreadsheet.userId !== userId) throw new Error("Spreadsheet not found or access denied");
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (data !== undefined) updates.data = data;
    if (title !== undefined) updates.title = title;
    await Spreadsheets.updateSpreadsheet(ctx, spreadsheetId, updates);
    return spreadsheetId;
  },
});

export const deleteSpreadsheet = mutation({
  args: { spreadsheetId: v.id("spreadsheets") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const spreadsheet = await Spreadsheets.getSpreadsheet(ctx, args.spreadsheetId);
    if (!spreadsheet || spreadsheet.userId !== userId) throw new Error("Spreadsheet not found or access denied");
    await Spreadsheets.deleteSpreadsheet(ctx, args.spreadsheetId);
  },
});

export const updateStatus = internalMutation({
  args: { spreadsheetId: v.id("spreadsheets"), status: v.string() },
  handler: async (ctx, args) => {
    await Spreadsheets.updateSpreadsheetStatus(ctx, args.spreadsheetId, args.status);
  },
});

export const updateData = internalMutation({
  args: { spreadsheetId: v.id("spreadsheets"), data: v.any() },
  handler: async (ctx, args) => {
    await Spreadsheets.updateSpreadsheetData(ctx, args.spreadsheetId, args.data);
  },
});

export const patch = internalMutation({
  args: { spreadsheetId: v.id("spreadsheets"), patch: v.any() },
  handler: async (ctx, args) => {
    await Spreadsheets.patchSpreadsheet(ctx, args.spreadsheetId, args.patch);
  },
});

export const createInternal = internalMutation({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    spreadsheetType: v.string(),
    customPrompt: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await Spreadsheets.createSpreadsheetAndFetch(ctx, {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      metadata: {
        spreadsheetType: args.spreadsheetType,
        customPrompt: args.customPrompt,
        ...args.metadata,
      },
    });
  },
});

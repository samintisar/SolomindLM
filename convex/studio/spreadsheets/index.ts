import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { getAuthUserId } from "../../auth";
import { assertCanEditNotebook, assertCanReadNotebook } from "../../_lib/notebookAccess";
import * as Spreadsheets from "../../_model/spreadsheets";

export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    await assertCanReadNotebook(ctx, args.notebookId, userId);
    return await Spreadsheets.listByNotebook(ctx, args.notebookId);
  },
});

export const get = query({
  args: { id: v.id("spreadsheets") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const spreadsheet = await Spreadsheets.getSpreadsheet(ctx, args.id);
    if (!spreadsheet) return null;
    try {
      await assertCanReadNotebook(ctx, spreadsheet.notebookId, userId);
    } catch {
      return null;
    }
    return spreadsheet;
  },
});

/**
 * Internal: Get a spreadsheet by ID (for use by jobs)
 */
export const getInternal = internalQuery({
  args: { id: v.id("spreadsheets") },
  handler: async (ctx, args) => {
    return await Spreadsheets.getSpreadsheet(ctx, args.id);
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
    await assertCanEditNotebook(ctx, args.notebookId, userId);
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
    if (!existing) throw new Error("Spreadsheet not found");
    await assertCanEditNotebook(ctx, existing.notebookId, userId);
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
    if (!spreadsheet) throw new Error("Spreadsheet not found");
    await assertCanEditNotebook(ctx, spreadsheet.notebookId, userId);
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
      throw new Error(
        "Please select at least one source. Content generation uses only your selected sources."
      );
    }
    await assertCanEditNotebook(ctx, notebookId, userId);
    const spreadsheetId = await Spreadsheets.createSpreadsheet(ctx, {
      userId,
      notebookId,
      title: title || "Spreadsheet",
      data: {},
      metadata: {
        spreadsheetType: spreadsheetType || "custom",
        customPrompt: customPrompt || "",
      },
      status: "generating",
    });
    await ctx.scheduler.runAfter(0, internal.studio.spreadsheets.job.spreadsheetGeneration, {
      spreadsheetId,
      userId,
      notebookId,
      documentIds,
      spreadsheetType: spreadsheetType || "custom",
      customPrompt: customPrompt || "",
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
    if (!spreadsheet) throw new Error("Spreadsheet not found or access denied");
    await assertCanEditNotebook(ctx, spreadsheet.notebookId, userId);
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
    if (!spreadsheet) throw new Error("Spreadsheet not found or access denied");
    await assertCanEditNotebook(ctx, spreadsheet.notebookId, userId);
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
    await assertCanEditNotebook(ctx, args.notebookId, args.userId);
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

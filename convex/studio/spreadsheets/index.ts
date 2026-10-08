import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation, internalQuery, mutation, query } from "../../_generated/server";
import { InputValidationError } from "../../_lib/errors";
import { assertCanEditNotebook, assertCanReadNotebook } from "../../_lib/notebookAccess";
import { toConvexError } from "../../_lib/serviceErrors";
import * as Spreadsheets from "../../_model/spreadsheets";
import { parseCsvDetailed } from "../../_shared/csv.helpers";
import { getAuthUserId } from "../../auth";

/** Largest CSV, in UTF-8 bytes, that `update` will store. */
export const SPREADSHEET_MAX_BYTES = 512 * 1024;
/** Most rows `update` will store, header included. */
export const SPREADSHEET_MAX_ROWS = 2000;
/** Most columns `update` will store. */
export const SPREADSHEET_MAX_COLUMNS = 50;

function invalidData(message: string): never {
  throw toConvexError(new InputValidationError(message, { field: "data" }));
}

function assertValidSpreadsheetCsv(data: string): void {
  if (new TextEncoder().encode(data).length > SPREADSHEET_MAX_BYTES) {
    invalidData("This spreadsheet is too large to save (512 KB at most).");
  }
  const { rows, unterminatedQuote } = parseCsvDetailed(data);
  if (unterminatedQuote) {
    invalidData("This spreadsheet has a quote that is never closed, so it can't be saved.");
  }
  if (rows.length > SPREADSHEET_MAX_ROWS) {
    invalidData("This spreadsheet has too many rows to save (2,000 at most).");
  }
  if (rows.some((row) => row.length > SPREADSHEET_MAX_COLUMNS)) {
    invalidData("This spreadsheet has too many columns to save (50 at most).");
  }
}

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
    data: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const existing = await Spreadsheets.getSpreadsheet(ctx, args.id);
    if (!existing) throw new Error("Spreadsheet not found");
    await assertCanEditNotebook(ctx, existing.notebookId, userId);

    const updates: Spreadsheets.SpreadsheetUpdate = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.data !== undefined) {
      if (existing.status !== "completed") {
        invalidData("This spreadsheet can't be edited until it has finished generating.");
      }
      assertValidSpreadsheetCsv(args.data);
      updates.data = args.data;
      updates.metadata = { ...(existing.metadata ?? {}), editedAt: Date.now() };
    }
    await Spreadsheets.updateSpreadsheet(ctx, args.id, updates);
    return await Spreadsheets.getSpreadsheet(ctx, args.id);
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

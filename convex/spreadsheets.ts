import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";

/**
 * List all spreadsheets for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("spreadsheets")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get a specific spreadsheet by ID
 */
export const get = query({
  args: { id: v.id("spreadsheets") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const spreadsheet = await ctx.db.get(args.id);

    if (!spreadsheet || spreadsheet.userId !== userId) {
      return null;
    }

    return spreadsheet;
  },
});

/**
 * Create a new spreadsheet
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

    const spreadsheetId = await ctx.db.insert("spreadsheets", {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      status: "draft",
      data: {},
      metadata: args.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return await ctx.db.get(spreadsheetId);
  },
});

/**
 * Update a spreadsheet
 */
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

    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Spreadsheet not found");
    }

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

/**
 * Delete a spreadsheet
 */
export const remove = mutation({
  args: { id: v.id("spreadsheets") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const spreadsheet = await ctx.db.get(args.id);
    if (!spreadsheet || spreadsheet.userId !== userId) {
      throw new Error("Spreadsheet not found");
    }

    await ctx.db.delete(args.id);

    return { message: "Spreadsheet deleted successfully" };
  },
});

/**
 * Generate a spreadsheet for a notebook
 */
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

    // Create spreadsheet record
    const spreadsheetId = await ctx.db.insert("spreadsheets", {
      userId,
      notebookId,
      title: title || "Spreadsheet",
      data: {},
      status: "generating",
      metadata: {
        spreadsheetType: spreadsheetType || 'custom',
        customPrompt: customPrompt || '',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Schedule the generation job
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

/**
 * Update a spreadsheet
 */
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

    // Verify ownership
    const spreadsheet = await ctx.db.get(spreadsheetId);
    if (!spreadsheet || spreadsheet.userId !== userId) {
      throw new Error("Spreadsheet not found or access denied");
    }

    // Update
    const updates: any = { updatedAt: Date.now() };
    if (data !== undefined) updates.data = data;
    if (title !== undefined) updates.title = title;

    await ctx.db.patch(spreadsheetId, updates);

    return spreadsheetId;
  },
});

/**
 * Delete a spreadsheet
 */
export const deleteSpreadsheet = mutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Verify ownership
    const spreadsheet = await ctx.db.get(args.spreadsheetId);
    if (!spreadsheet || spreadsheet.userId !== userId) {
      throw new Error("Spreadsheet not found or access denied");
    }

    await ctx.db.delete(args.spreadsheetId);
  },
});

/**
 * Internal: Update spreadsheet status
 */
export const updateStatus = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.spreadsheetId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update spreadsheet data
 */
export const updateData = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.spreadsheetId, {
      data: args.data,
      status: "completed",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update spreadsheet with partial updates
 */
export const patch = internalMutation({
  args: {
    spreadsheetId: v.id("spreadsheets"),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.spreadsheetId, {
      ...args.patch,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Create a spreadsheet (used by action for best practices)
 */
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
    const now = Date.now();
    const spreadsheetId = await ctx.db.insert("spreadsheets", {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      data: {},
      status: "generating",
      metadata: {
        spreadsheetType: args.spreadsheetType,
        customPrompt: args.customPrompt,
        ...args.metadata,
      },
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get("spreadsheets", spreadsheetId);
  },
});

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";

/**
 * List all reports for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("reports")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get a specific report by ID
 */
export const get = query({
  args: { id: v.id("reports") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const report = await ctx.db.get(args.id);

    if (!report || report.userId !== userId) {
      return null;
    }

    return report;
  },
});

/**
 * Get reports grouped by type for a notebook
 */
export const getReports = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("reports")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();
  },
});

/**
 * Create a new report
 */
export const create = mutation({
  args: {
    notebookId: v.id("notebooks"),
    title: v.string(),
    reportType: v.optional(v.string()),
    content: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Verify user owns the notebook
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      throw new Error("Notebook not found");
    }

    const now = Date.now();

    const reportId = await ctx.db.insert("reports", {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      reportType: args.reportType,
      content: args.content,
      status: "draft",
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });

    return await ctx.db.get("reports", reportId);
  },
});

/**
 * Internal: Create a report (for use by contentGeneration action only).
 * Uses internal so Convex code calls internal.* instead of api.* per best practices.
 */
export const createInternal = internalMutation({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    reportType: v.optional(v.string()),
    content: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const reportId = await ctx.db.insert("reports", {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      reportType: args.reportType,
      content: args.content,
      status: "draft",
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get("reports", reportId);
  },
});

/**
 * Update a report
 */
export const update = mutation({
  args: {
    id: v.id("reports"),
    title: v.optional(v.string()),
    reportType: v.optional(v.string()),
    status: v.optional(v.string()),
    content: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const { id, ...updates } = args;

    // Verify ownership
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Report not found");
    }

    const updateData: any = {
      ...updates,
      updatedAt: Date.now(),
    };

    await ctx.db.patch(id, updateData);

    return await ctx.db.get(id);
  },
});

/**
 * Delete a report
 */
export const remove = mutation({
  args: { id: v.id("reports") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const report = await ctx.db.get(args.id);
    if (!report || report.userId !== userId) {
      throw new Error("Report not found");
    }

    await ctx.db.delete(args.id);

    return { message: "Report deleted successfully" };
  },
});

/**
 * Internal: Update report status
 */
export const updateStatus = internalMutation({
  args: {
    reportId: v.id("reports"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update report content
 */
export const updateContent = internalMutation({
  args: {
    reportId: v.id("reports"),
    content: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, {
      content: args.content,
      status: "completed",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Update report with partial updates
 */
export const patch = internalMutation({
  args: {
    reportId: v.id("reports"),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, {
      ...args.patch,
      updatedAt: Date.now(),
    });
  },
});

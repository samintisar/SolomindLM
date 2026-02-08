import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthUserId } from "./auth";
import * as Notebooks from "./model/notebooks";
import * as Reports from "./model/reports";

/**
 * List all reports for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await Reports.listByNotebook(ctx, args.notebookId, userId);
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

    const report = await Reports.getReport(ctx, args.id);

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

    return await Reports.listByNotebook(ctx, args.notebookId, userId);
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
    const notebook = await Notebooks.getNotebook(ctx, args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      throw new Error("Notebook not found");
    }

    return await Reports.createReportAndFetch(ctx, {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      reportType: args.reportType,
      content: args.content,
      metadata: args.metadata,
    });
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
    return await Reports.createReportAndFetch(ctx, {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      reportType: args.reportType,
      content: args.content,
      metadata: args.metadata,
    });
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
    const existing = await Reports.getReport(ctx, id);
    if (!existing || existing.userId !== userId) {
      throw new Error("Report not found");
    }

    await Reports.updateReport(ctx, id, updates);

    return await Reports.getReport(ctx, id);
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

    const report = await Reports.getReport(ctx, args.id);
    if (!report || report.userId !== userId) {
      throw new Error("Report not found");
    }

    await Reports.deleteReport(ctx, args.id);

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
    await Reports.updateReportStatus(ctx, args.reportId, args.status);
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
    await Reports.updateReportContent(ctx, args.reportId, args.content);
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
    await Reports.patchReport(ctx, args.reportId, args.patch);
  },
});

import { v } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "../../_generated/server";
import { assertCanEditNotebook, assertCanReadNotebook } from "../../_lib/notebookAccess";
import * as Reports from "../../_model/reports";
import { getAuthUserId } from "../../auth";

function toReportDTO(report: Doc<"reports">) {
  return {
    id: report._id,
    notebookId: report.notebookId,
    title: report.title,
    content: report.content,
    reportType: report.reportType,
    status: report.status,
    metadata: report.metadata,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

/**
 * Internal: Get a report by ID (for use by jobs)
 */
export const getInternal = internalQuery({
  args: { id: v.id("reports") },
  handler: async (ctx, args) => {
    return await Reports.getReport(ctx, args.id);
  },
});

/**
 * List all reports for a notebook
 */
export const list = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    await assertCanReadNotebook(ctx, args.notebookId, userId);
    const reports = await Reports.listByNotebook(ctx, args.notebookId);
    return reports.map(toReportDTO);
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

    if (!report) {
      return null;
    }

    try {
      await assertCanReadNotebook(ctx, report.notebookId, userId);
    } catch {
      return null;
    }

    return toReportDTO(report);
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

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    const report = await Reports.createReportAndFetch(ctx, {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      reportType: args.reportType,
      content: args.content,
      metadata: args.metadata,
    });
    return toReportDTO(report);
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
    await assertCanEditNotebook(ctx, args.notebookId, args.userId);
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

    const existing = await Reports.getReport(ctx, id);
    if (!existing) {
      throw new Error("Report not found");
    }

    await assertCanEditNotebook(ctx, existing.notebookId, userId);

    await Reports.updateReport(ctx, id, updates);

    const report = await Reports.getReport(ctx, id);
    if (!report) throw new Error("Report not found");
    return toReportDTO(report);
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
    if (!report) {
      throw new Error("Report not found");
    }

    await assertCanEditNotebook(ctx, report.notebookId, userId);

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

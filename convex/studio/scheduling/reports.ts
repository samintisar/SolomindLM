"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { action } from "../../_generated/server";
import { getAuthUserId } from "../../auth";

interface ScheduleReportResult {
  reportId: string;
  status: string;
  report: { _id: string; title: string; status: string };
}

export const scheduleReport = action({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    reportType: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ScheduleReportResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await ctx.runMutation(internal._lib.limits.checkDailyLimitInternal, {
      userId,
      feature: "report",
    });

    const documentIds = args.documentIds ?? [];
    if (documentIds.length === 0) {
      throw new Error(
        "Please select at least one source. Content generation uses only your selected sources."
      );
    }

    const report = await ctx.runMutation(internal.studio.reports.index.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: "Report",
      reportType: args.reportType || "summary",
      metadata: {
        status: "generating",
        documentIds,
      },
    });
    if (!report) {
      throw new Error("Failed to create report");
    }
    const reportId = report._id;

    await ctx.scheduler.runAfter(0, internal.studio.reports.job.reportGeneration, {
      reportId,
      userId,
      notebookId: args.notebookId,
      documentIds,
      reportType: args.reportType || "summary",
      customPrompt: args.customPrompt,
    });

    return {
      reportId,
      status: "generating",
      report: { _id: reportId, title: "Report", status: "generating" },
    };
  },
});

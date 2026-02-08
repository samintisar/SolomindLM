import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

/**
 * Database operations for reports.
 * No query/mutation/action exports — used by convex/reports.ts and jobs.
 */

export async function getReport(
  ctx: QueryCtx,
  reportId: Id<"reports">
): Promise<Doc<"reports"> | null> {
  return await ctx.db.get("reports", reportId);
}

export async function listByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  userId?: Id<"users">
): Promise<Doc<"reports">[]> {
  const query = ctx.db
    .query("reports")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId));

  if (userId) {
    return await query.filter((q) => q.eq(q.field("userId"), userId)).order("desc").collect();
  }
  return await query.order("desc").collect();
}

export type ReportCreate = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  title: string;
  reportType?: string;
  content?: unknown;
  metadata?: unknown;
};

export async function createReport(
  ctx: MutationCtx,
  data: ReportCreate
): Promise<Id<"reports">> {
  const now = Date.now();
  return await ctx.db.insert("reports", {
    userId: data.userId,
    notebookId: data.notebookId,
    title: data.title,
    reportType: data.reportType,
    content: data.content,
    status: "draft",
    metadata: data.metadata,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Create a report and return the created document.
 * Use this when you need the created document immediately.
 */
export async function createReportAndFetch(
  ctx: MutationCtx,
  data: ReportCreate
): Promise<Doc<"reports">> {
  const id = await createReport(ctx, data);
  const report = await getReport(ctx, id);
  if (!report) throw new Error("Failed to create report");
  return report;
}

export type ReportUpdate = {
  title?: string;
  reportType?: string;
  status?: string;
  content?: unknown;
  metadata?: unknown;
};

export async function updateReport(
  ctx: MutationCtx,
  reportId: Id<"reports">,
  updates: ReportUpdate
): Promise<void> {
  await ctx.db.patch("reports", reportId, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function updateReportStatus(
  ctx: MutationCtx,
  reportId: Id<"reports">,
  status: string
): Promise<void> {
  await ctx.db.patch("reports", reportId, {
    status,
    updatedAt: Date.now(),
  });
}

export async function updateReportContent(
  ctx: MutationCtx,
  reportId: Id<"reports">,
  content: unknown
): Promise<void> {
  await ctx.db.patch("reports", reportId, {
    content,
    status: "completed",
    updatedAt: Date.now(),
  });
}

export async function patchReport(
  ctx: MutationCtx,
  reportId: Id<"reports">,
  patch: Record<string, unknown>
): Promise<void> {
  await ctx.db.patch("reports", reportId, {
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function deleteReport(
  ctx: MutationCtx,
  reportId: Id<"reports">
): Promise<void> {
  await ctx.db.delete("reports", reportId);
}

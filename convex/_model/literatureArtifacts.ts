import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Literature tables and reports come from two places: the Studio panel, and chat literature
 * reviews. Chat outputs belong to the creator's chat thread, so they are never listed in Studio,
 * other readers can't open them, and forks don't copy them.
 */

/** Tables and reports a notebook's literature review sessions point at. */
export async function getChatLinkedLiteratureArtifactIds(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<{
  tableIds: Set<Id<"literatureTables">>;
  reportIds: Set<Id<"literatureReports">>;
}> {
  const sessions = await ctx.db
    .query("literatureReviewSessions")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .collect();

  const tableIds = new Set<Id<"literatureTables">>();
  const reportIds = new Set<Id<"literatureReports">>();
  for (const session of sessions) {
    if (session.tableId) tableIds.add(session.tableId);
    if (session.reportId) reportIds.add(session.reportId);
  }
  return { tableIds, reportIds };
}

// Older chat outputs carry neither a session id nor a session link, only these titles.
function isChatLiteratureTableTitle(title: string): boolean {
  return title.startsWith("Literature table —") || title.startsWith("Literature table - ");
}

function isChatLiteratureReportTitle(title: string): boolean {
  return title.startsWith("Report —") || title.startsWith("Report - ");
}

export function isChatLiteratureTable(
  table: {
    _id: Id<"literatureTables">;
    title: string;
    literatureReviewSessionId?: Id<"literatureReviewSessions">;
  },
  chatTableIds: Set<Id<"literatureTables">>
): boolean {
  return (
    table.literatureReviewSessionId !== undefined ||
    chatTableIds.has(table._id) ||
    isChatLiteratureTableTitle(table.title)
  );
}

export function isChatLiteratureReport(
  report: {
    _id: Id<"literatureReports">;
    title: string;
    literatureReviewSessionId?: Id<"literatureReviewSessions">;
  },
  chatReportIds: Set<Id<"literatureReports">>
): boolean {
  return (
    report.literatureReviewSessionId !== undefined ||
    chatReportIds.has(report._id) ||
    isChatLiteratureReportTitle(report.title)
  );
}

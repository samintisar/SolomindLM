import type { ReportNote } from "@/shared/types/index";
import { getReportSubtitle, normalizeReportTypeId } from "@/shared/types/reportTypes";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export interface CreateReportParams {
  notebookId: string;
  documentIds: string[];
  reportType: string;
  customPrompt?: string;
}

export interface CreateReportResponse {
  reportId: string;
  status: string;
  note: ReportNote;
}

/**
 * Map a database report response to the frontend ReportNote interface with proper preview
 */
function mapDatabaseReportToNote(dbReport: any): ReportNote {
  const reportType = normalizeReportTypeId(
    dbReport.reportType || dbReport.metadata?.reportType || "custom"
  );
  let preview: string;

  // Determine preview based on status
  if (
    dbReport.status === "generating" ||
    dbReport.status === "mapping" ||
    dbReport.status === "collapsing" ||
    dbReport.status === "reducing"
  ) {
    preview = getReportSubtitle(reportType) + " • Generating...";
  } else if (dbReport.status === "completed") {
    preview = getReportSubtitle(reportType);
  } else if (dbReport.status === "failed") {
    preview = `${getReportSubtitle(reportType)} • Failed`;
  } else {
    preview = getReportSubtitle(reportType);
  }

  return {
    id: dbReport._id,
    title: dbReport.title,
    preview,
    type: "report",
    content: dbReport.content || "",
    status: dbReport.status,
    metadata: {
      reportType,
      documentIds: dbReport.metadata?.documentIds || [],
      phase: dbReport.metadata?.phase,
      error: dbReport.metadata?.error,
      chunksProcessed: dbReport.metadata?.chunksProcessed,
    },
  };
}

/**
 * Get all reports for a notebook
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useReports(notebookId: string | null) {
  const reports = useQuery(
    api.studio.reports.index.list,
    notebookId ? { notebookId: notebookId as Id<"notebooks"> } : "skip"
  );
  return reports?.map(mapDatabaseReportToNote);
}

/**
 * Get a specific report by ID
 */
export function useReport(reportId: string | null) {
  const report = useQuery(
    api.studio.reports.index.get,
    reportId ? { id: reportId as Id<"reports"> } : "skip"
  );
  return report ? mapDatabaseReportToNote(report) : null;
}

/**
 * Create a new report and queue generation
 */
export function useCreateReport() {
  const schedule = useAction(api.studio.scheduling.reports.scheduleReport);

  return async (params: CreateReportParams): Promise<CreateReportResponse> => {
    const result = await schedule({
      notebookId: params.notebookId as Id<"notebooks">,
      documentIds: params.documentIds as Id<"documents">[],
      reportType: params.reportType,
      customPrompt: params.customPrompt,
    });

    return {
      reportId: result.reportId,
      status: result.status,
      note: mapDatabaseReportToNote({
        ...result.report,
        _id: result.reportId,
        reportType: params.reportType,
        metadata: { documentIds: params.documentIds },
      }),
    };
  };
}

/**
 * Update a report (e.g. title or content) with optimistic update
 */
export function useUpdateReport() {
  const update = useMutation(api.studio.reports.index.update).withOptimisticUpdate(
    (localStore, args) => {
      const { id, title, content } = args;

      // Read the current report to get its notebookId
      const report = localStore.getQuery(api.studio.reports.index.get, { id });
      if (report) {
        const updates: Record<string, unknown> = {};
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        if (Object.keys(updates).length > 0) {
          localStore.setQuery(api.studio.reports.index.get, { id }, { ...report, ...updates });
        }

        // Update list view when title changes
        if (title !== undefined) {
          const listResult = localStore.getQuery(api.studio.reports.index.list, {
            notebookId: report.notebookId,
          });
          if (listResult) {
            localStore.setQuery(
              api.studio.reports.index.list,
              { notebookId: report.notebookId },
              listResult.map((r: { _id: string; [key: string]: unknown }) =>
                r._id === id ? { ...r, title } : r
              )
            );
          }
        }
      }
    }
  );

  return async (reportId: string, updates: { title?: string; content?: string }) => {
    await update({
      id: reportId as Id<"reports">,
      ...updates,
    });
  };
}

/**
 * Delete a report by ID with optimistic update
 */
export function useDeleteReport() {
  const remove = useMutation(api.studio.reports.index.remove).withOptimisticUpdate(
    (localStore, args) => {
      // Read the current report to get its notebookId
      const report = localStore.getQuery(api.studio.reports.index.get, { id: args.id });
      if (report) {
        // Update list view using the notebookId from the item
        const listResult = localStore.getQuery(api.studio.reports.index.list, {
          notebookId: report.notebookId,
        });
        if (listResult) {
          localStore.setQuery(
            api.studio.reports.index.list,
            { notebookId: report.notebookId },
            listResult.filter((r: { _id: string }) => r._id !== args.id)
          );
        }
      }

      // Clear detail view
      localStore.setQuery(api.studio.reports.index.get, { id: args.id }, null);
    }
  );

  return async (reportId: string) => {
    await remove({ id: reportId as Id<"reports"> });
  };
}

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation } from "convex/react";
import type { ReportNote } from "@/shared/types/index";
import { getReportSubtitle, normalizeReportTypeId } from "@/shared/types/reportTypes";
import { patchNoteInNotesCache, removeNoteFromNotesCache } from "./notesCache";

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
    preview = getReportSubtitle(reportType) + " · Generating…";
  } else if (dbReport.status === "completed") {
    preview = getReportSubtitle(reportType);
  } else if (dbReport.status === "failed") {
    preview = `${getReportSubtitle(reportType)} · Failed`;
  } else {
    preview = getReportSubtitle(reportType);
  }

  return {
    id: dbReport.id ?? dbReport._id,
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
    (localStore, { id, ...updates }) => {
      patchNoteInNotesCache(localStore, id, updates);
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
    (localStore, { id }) => {
      removeNoteFromNotesCache(localStore, id);
    }
  );

  return async (reportId: string) => {
    await remove({ id: reportId as Id<"reports"> });
  };
}

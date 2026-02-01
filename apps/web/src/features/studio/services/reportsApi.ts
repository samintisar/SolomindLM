import type { Note, ReportNote } from '@/shared/types/index';
import { getReportSubtitle, normalizeReportTypeId } from '@/shared/types/reportTypes';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

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
  const reportType = normalizeReportTypeId(dbReport.reportType || dbReport.metadata?.reportType || 'custom');
  let preview = '';

  // Determine preview based on status
  if (dbReport.status === 'generating' || dbReport.status === 'mapping' || dbReport.status === 'collapsing' || dbReport.status === 'reducing') {
    preview = getReportSubtitle(reportType) + ' • Generating...';
  } else if (dbReport.status === 'completed') {
    preview = getReportSubtitle(reportType);
  } else if (dbReport.status === 'failed') {
    preview = `${getReportSubtitle(reportType)} • Failed`;
  } else {
    preview = getReportSubtitle(reportType);
  }

  return {
    id: dbReport._id,
    title: dbReport.title,
    preview,
    type: 'report',
    content: dbReport.content || '',
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
    api.reports.list,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : 'skip'
  );
  return reports?.map(mapDatabaseReportToNote);
}

/**
 * Get a specific report by ID
 */
export function useReport(reportId: string | null) {
  const report = useQuery(
    api.reports.get,
    reportId ? { id: reportId as Id<'reports'> } : 'skip'
  );
  return report ? mapDatabaseReportToNote(report) : null;
}

/**
 * Create a new report and queue generation
 */
export function useCreateReport() {
  const schedule = useAction(api.contentGeneration.scheduleReport);

  return async (params: CreateReportParams): Promise<CreateReportResponse> => {
    const result = await schedule({
      notebookId: params.notebookId as Id<'notebooks'>,
      documentIds: params.documentIds as Id<'documents'>[],
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
 * Update a report (e.g. title) with optimistic update
 */
export function useUpdateReport() {
  const update = useMutation(api.reports.update).withOptimisticUpdate((localStore, args) => {
    const { id, title } = args;

    // Read the current report to get its notebookId
    const report = localStore.getQuery(api.reports.get, { id });
    if (report) {
      // Update detail view
      localStore.setQuery(
        api.reports.get,
        { id },
        { ...report, ...(title !== undefined && { title }) }
      );

      // Update list view using the notebookId from the item (if title is being updated)
      if (title !== undefined) {
        const listResult = localStore.getQuery(api.reports.list, { notebookId: report.notebookId });
        if (listResult) {
          localStore.setQuery(
            api.reports.list,
            { notebookId: report.notebookId },
            listResult.map(r =>
              r._id === id
                ? { ...r, title }
                : r
            )
          );
        }
      }
    }
  });

  return async (reportId: string, updates: { title?: string }) => {
    await update({
      id: reportId as Id<'reports'>,
      ...updates,
    });
  };
}

/**
 * Delete a report by ID with optimistic update
 */
export function useDeleteReport() {
  const remove = useMutation(api.reports.remove).withOptimisticUpdate((localStore, args) => {
    // Read the current report to get its notebookId
    const report = localStore.getQuery(api.reports.get, { id: args.id });
    if (report) {
      // Update list view using the notebookId from the item
      const listResult = localStore.getQuery(api.reports.list, { notebookId: report.notebookId });
      if (listResult) {
        localStore.setQuery(
          api.reports.list,
          { notebookId: report.notebookId },
          listResult.filter(r => r._id !== args.id)
        );
      }
    }

    // Clear detail view
    localStore.setQuery(api.reports.get, { id: args.id }, null);
  });

  return async (reportId: string) => {
    await remove({ id: reportId as Id<'reports'> });
  };
}

/**
 * Poll report status until completion
 * Note: With Convex, you can also use useQuery with real-time updates
 * This polling function is kept for compatibility
 * @param initialNote - Optional note to use when getReport() hasn't returned yet (e.g. before Convex reactivity updates)
 */
export async function pollReportStatus(
  getReport: () => ReportNote | null | undefined,
  onUpdate?: (note: ReportNote) => void,
  maxAttempts = 180, // 6 minutes @ 2s intervals
  interval = 2000,
  initialNote?: ReportNote
): Promise<ReportNote> {
  for (let i = 0; i < maxAttempts; i++) {
    const note = getReport() ?? initialNote;

    if (!note) {
      throw new Error('Report not found');
    }

    if (note.status === 'completed' || note.status === 'failed') {
      return note;
    }

    onUpdate?.(note);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Report generation timed out');
}

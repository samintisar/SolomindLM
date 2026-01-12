import type { Note, ReportNote } from '@/shared/types/index';
import { getReportSubtitle, normalizeReportTypeId } from '@/shared/types/reportTypes';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/shared/utils/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface CreateReportParams {
  userId: string;
  noteId: string;
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
 * Get userId from localStorage (for transition period)
 * TODO: Replace with proper auth context after migration
 */
function getUserId(): string | null {
  const storedUser = localStorage.getItem('solomind_user');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      return user.id || user.user?.id || null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Map a database note response to the frontend ReportNote interface with proper preview
 */
function mapDatabaseNoteToNote(dbNote: any): ReportNote {
  const reportType = normalizeReportTypeId(dbNote.metadata?.reportType || 'custom');
  let preview = '';

  // Determine preview based on status
  if (dbNote.status === 'generating' || dbNote.status === 'mapping' || dbNote.status === 'collapsing' || dbNote.status === 'reducing') {
    preview = getReportSubtitle(reportType);
  } else if (dbNote.status === 'completed') {
    preview = getReportSubtitle(reportType);
  } else if (dbNote.status === 'failed') {
    preview = `${getReportSubtitle(reportType)} • Failed`;
  } else {
    preview = getReportSubtitle(reportType);
  }

  return {
    id: dbNote.id,
    title: dbNote.title,
    preview,
    type: 'report',
    content: dbNote.content || '',
    status: dbNote.status,
    metadata: {
      reportType,
      documentIds: dbNote.metadata?.documentIds || [],
      phase: dbNote.metadata?.phase,
      error: dbNote.metadata?.error,
      chunksProcessed: dbNote.metadata?.chunksProcessed,
    },
  };
}

export const reportsApi = {
  /**
   * Create a new report and queue generation
   */
  async createReport(params: CreateReportParams): Promise<CreateReportResponse> {
    const response = await apiPost('/api/reports', params);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create report');
    }

    const result = await response.json();
    return {
      reportId: result.reportId,
      status: result.status,
      note: mapDatabaseNoteToNote(result.note),
    };
  },

  /**
   * Get a specific report by ID
   */
  async getReport(reportId: string): Promise<ReportNote> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiGet(`/api/reports/${reportId}?${params.toString()}`);

    if (!response.ok) {
      throw new Error('Failed to fetch report');
    }

    const dbNote = await response.json();
    return mapDatabaseNoteToNote(dbNote);
  },

  /**
   * Poll report status until completion
   */
  async pollReportStatus(
    reportId: string,
    onUpdate?: (note: ReportNote) => void,
    maxAttempts = 180, // 6 minutes @ 2s intervals
    interval = 2000
  ): Promise<ReportNote> {
    for (let i = 0; i < maxAttempts; i++) {
      const note = await this.getReport(reportId);

      if (note.status === 'completed' || note.status === 'failed') {
        return note;
      }

      onUpdate?.(note);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Report generation timed out');
  },

  /**
   * Get all reports for a notebook
   */
  async getReports(notebookId: string): Promise<ReportNote[]> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiGet(`/api/reports/notebook/${notebookId}?${params.toString()}`);

    if (!response.ok) {
      throw new Error('Failed to fetch reports');
    }

    const dbNotes = await response.json();
    return dbNotes.map(mapDatabaseNoteToNote);
  },

  /**
   * Delete a report by ID
   */
  async deleteReport(reportId: string): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    await apiDelete(`/api/reports/${reportId}?${params.toString()}`);
  },
};

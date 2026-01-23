import type { Note, SpreadsheetNote } from '@/shared/types/index';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/shared/utils/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface CreateSpreadsheetParams {
  notebookId: string;
  documentIds: string[];
  spreadsheetType: 'data_extraction' | 'comparison_table' | 'timeline' | 'financial_summary' | 'custom';
  customPrompt?: string;
}

export interface CreateSpreadsheetResponse {
  spreadsheetId: string;
  status: string;
  spreadsheet: SpreadsheetNote;
}

/**
 * Get display label for spreadsheet type
 */
export function getSpreadsheetTypeLabel(spreadsheetType: string): string {
  const labels: Record<string, string> = {
    data_extraction: 'Data Table',
    comparison_table: 'Comparison',
    timeline: 'Timeline',
    financial_summary: 'Financial',
    custom: 'Custom',
  };
  return labels[spreadsheetType] || 'Spreadsheet';
}

/**
 * Get subtitle for spreadsheet based on status and type
 */
export function getSpreadsheetSubtitle(
  spreadsheetType: string,
  status?: string
): string {
  const typeLabel = getSpreadsheetTypeLabel(spreadsheetType);

  if (status === 'generating') {
    return `Spreadsheet • Generating...`;
  } else if (status === 'failed') {
    return `Spreadsheet • Failed`;
  }
  return `Spreadsheet • ${typeLabel}`;
}

/**
 * Map a database spreadsheet response to the frontend SpreadsheetNote interface
 */
function mapDatabaseSpreadsheetToNote(dbSpreadsheet: any): SpreadsheetNote {
  const spreadsheetType = dbSpreadsheet.metadata?.spreadsheetType || 'custom';
  const preview = getSpreadsheetSubtitle(spreadsheetType, dbSpreadsheet.status);

  return {
    id: dbSpreadsheet.id,
    title: dbSpreadsheet.title,
    preview,
    type: 'spreadsheet',
    content: dbSpreadsheet.content || '',
    status: dbSpreadsheet.status,
    metadata: {
      spreadsheetType,
      documentIds: dbSpreadsheet.metadata?.documentIds || [],
      phase: dbSpreadsheet.metadata?.phase,
      error: dbSpreadsheet.metadata?.error,
      customPrompt: dbSpreadsheet.metadata?.customPrompt,
    },
  };
}

export const spreadsheetsApi = {
  /**
   * Create a new spreadsheet and queue generation
   */
  async createSpreadsheet(params: CreateSpreadsheetParams): Promise<CreateSpreadsheetResponse> {
    const response = await apiPost('/api/spreadsheets', params);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create spreadsheet');
    }

    const result = await response.json();
    return {
      spreadsheetId: result.spreadsheetId,
      status: result.status,
      spreadsheet: mapDatabaseSpreadsheetToNote(result.spreadsheet),
    };
  },

  /**
   * Get a specific spreadsheet by ID
   */
  async getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetNote> {
    const response = await apiGet(`/api/spreadsheets/${spreadsheetId}`);

    if (!response.ok) {
      throw new Error('Failed to fetch spreadsheet');
    }

    const dbSpreadsheet = await response.json();
    return mapDatabaseSpreadsheetToNote(dbSpreadsheet);
  },

  /**
   * Poll spreadsheet status until completion
   */
  async pollSpreadsheetStatus(
    spreadsheetId: string,
    onUpdate?: (note: SpreadsheetNote) => void,
    maxAttempts = 180, // 6 minutes @ 2s intervals
    interval = 2000
  ): Promise<SpreadsheetNote> {
    for (let i = 0; i < maxAttempts; i++) {
      const note = await this.getSpreadsheet(spreadsheetId);

      if (note.status === 'completed' || note.status === 'failed') {
        return note;
      }

      onUpdate?.(note);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Spreadsheet generation timed out');
  },

  /**
   * Get all spreadsheets for a notebook
   */
  async getSpreadsheets(notebookId: string): Promise<SpreadsheetNote[]> {
    const response = await apiGet(`/api/spreadsheets/notebook/${notebookId}`);

    if (!response.ok) {
      throw new Error('Failed to fetch spreadsheets');
    }

    const dbSpreadsheets = await response.json();
    return dbSpreadsheets.map(mapDatabaseSpreadsheetToNote);
  },

  /**
   * Rename a spreadsheet
   */
  async renameSpreadsheet(spreadsheetId: string, title: string): Promise<void> {
    await apiPatch(`/api/spreadsheets/${spreadsheetId}`, { title });
  },

  /**
   * Delete a spreadsheet by ID
   */
  async deleteSpreadsheet(spreadsheetId: string): Promise<void> {
    await apiDelete(`/api/spreadsheets/${spreadsheetId}`);
  },
};

import type { Note, SpreadsheetNote } from '@/shared/types/index';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

export interface CreateSpreadsheetParams {
  notebookId: string;
  documentIds: string[];
  title?: string;
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
function mapSpreadsheetToNote(dbSpreadsheet: any): SpreadsheetNote {
  const spreadsheetType = dbSpreadsheet.metadata?.spreadsheetType || 'custom';
  const preview = getSpreadsheetSubtitle(spreadsheetType, dbSpreadsheet.status);

  return {
    id: dbSpreadsheet._id,
    title: dbSpreadsheet.title,
    preview,
    type: 'spreadsheet',
    content: typeof dbSpreadsheet.data === 'string' ? dbSpreadsheet.data : JSON.stringify(dbSpreadsheet.data || {}, null, 2),
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

/**
 * Get all spreadsheets for a notebook
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useSpreadsheets(notebookId: string | null) {
  const spreadsheets = useQuery(
    api.spreadsheets.list,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : 'skip'
  );
  return spreadsheets?.map(mapSpreadsheetToNote);
}

/**
 * Get a specific spreadsheet by ID
 */
export function useSpreadsheet(spreadsheetId: string | null) {
  const spreadsheet = useQuery(
    api.spreadsheets.get,
    spreadsheetId ? { id: spreadsheetId as Id<'spreadsheets'> } : 'skip'
  );
  return spreadsheet ? mapSpreadsheetToNote(spreadsheet) : null;
}

/**
 * Create a new spreadsheet and queue generation
 */
export function useCreateSpreadsheet() {
  const generate = useMutation(api.spreadsheets.generateSpreadsheet);

  return async (params: CreateSpreadsheetParams): Promise<CreateSpreadsheetResponse> => {
    const result = await generate({
      notebookId: params.notebookId as Id<'notebooks'>,
      documentIds: params.documentIds as Id<'documents'>[],
      title: params.title,
    });

    return {
      spreadsheetId: result,
      status: 'pending',
      spreadsheet: mapSpreadsheetToNote({ _id: result, status: 'pending', title: params.title || 'Spreadsheet' }),
    };
  };
}

/**
 * Rename a spreadsheet by ID with optimistic update
 */
export function useRenameSpreadsheet() {
  const update = useMutation(api.spreadsheets.update).withOptimisticUpdate((localStore, args) => {
    const { id, title } = args;

    // Read the current spreadsheet to get its notebookId
    const spreadsheet = localStore.getQuery(api.spreadsheets.get, { id });
    if (spreadsheet) {
      // Update detail view
      localStore.setQuery(
        api.spreadsheets.get,
        { id },
        { ...spreadsheet, title }
      );

      // Update list view using the notebookId from the item
      const listResult = localStore.getQuery(api.spreadsheets.list, { notebookId: spreadsheet.notebookId });
      if (listResult) {
        localStore.setQuery(
          api.spreadsheets.list,
          { notebookId: spreadsheet.notebookId },
          listResult.map(ss =>
            ss._id === id
              ? { ...ss, title }
              : ss
          )
        );
      }
    }
  });

  return async (spreadsheetId: string, newTitle: string) => {
    return await update({
      id: spreadsheetId as Id<'spreadsheets'>,
      title: newTitle,
    });
  };
}

/**
 * Delete a spreadsheet by ID with optimistic update
 */
export function useDeleteSpreadsheet() {
  const remove = useMutation(api.spreadsheets.remove).withOptimisticUpdate((localStore, args) => {
    // Read the current spreadsheet to get its notebookId
    const spreadsheet = localStore.getQuery(api.spreadsheets.get, { id: args.id });
    if (spreadsheet) {
      // Update list view using the notebookId from the item
      const listResult = localStore.getQuery(api.spreadsheets.list, { notebookId: spreadsheet.notebookId });
      if (listResult) {
        localStore.setQuery(
          api.spreadsheets.list,
          { notebookId: spreadsheet.notebookId },
          listResult.filter(ss => ss._id !== args.id)
        );
      }
    }

    // Clear detail view
    localStore.setQuery(api.spreadsheets.get, { id: args.id }, null);
  });

  return async (spreadsheetId: string) => {
    await remove({ id: spreadsheetId as Id<'spreadsheets'> });
  };
}

/**
 * Poll spreadsheet status until completion.
 * Pass initialNote from the create response so the first poll succeeds before
 * Convex query reactivity has added the new item to the notes list.
 */
export async function pollSpreadsheetStatus(
  getSpreadsheet: () => SpreadsheetNote | null | undefined,
  onUpdate?: (note: SpreadsheetNote) => void,
  maxAttempts = 180, // 6 minutes @ 2s intervals
  interval = 2000,
  initialNote?: SpreadsheetNote
): Promise<SpreadsheetNote> {
  for (let i = 0; i < maxAttempts; i++) {
    const note = getSpreadsheet() ?? initialNote;

    if (!note) {
      throw new Error('Spreadsheet not found');
    }

    if (note.status === 'completed' || note.status === 'failed') {
      return note;
    }

    onUpdate?.(note);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Spreadsheet generation timed out');
}

/**
 * Legacy API object for backward compatibility
 * @deprecated Use individual hooks instead
 */
export const spreadsheetsApi = {
  useSpreadsheets,
  useSpreadsheet,
  useCreateSpreadsheet,
  useRenameSpreadsheet,
  useDeleteSpreadsheet,
  pollSpreadsheetStatus,
  getSpreadsheetTypeLabel,
  getSpreadsheetSubtitle,
};

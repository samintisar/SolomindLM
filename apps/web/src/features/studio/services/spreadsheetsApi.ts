import type { SpreadsheetNote } from "@/shared/types/index";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export interface CreateSpreadsheetParams {
  notebookId: string;
  documentIds: string[];
  title?: string;
  spreadsheetType?: string;
  customPrompt?: string;
}

export interface CreateSpreadsheetResponse {
  spreadsheetId: string;
  status: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spreadsheet: any; // Full database object
}

/**
 * Get display label for spreadsheet type
 */
export function getSpreadsheetTypeLabel(spreadsheetType: string): string {
  const labels: Record<string, string> = {
    data_extraction: "Data Table",
    comparison_table: "Comparison",
    timeline: "Timeline",
    financial_summary: "Financial",
    custom: "Custom",
  };
  return labels[spreadsheetType] || "Spreadsheet";
}

/**
 * Get subtitle for spreadsheet based on status and type
 */
export function getSpreadsheetSubtitle(spreadsheetType: string, status?: string): string {
  const typeLabel = getSpreadsheetTypeLabel(spreadsheetType);

  if (status === "generating") {
    return `Spreadsheet · Generating…`;
  } else if (status === "failed") {
    return `Spreadsheet · Failed`;
  }
  return `Spreadsheet · ${typeLabel}`;
}

/**
 * Map a database spreadsheet response to the frontend SpreadsheetNote interface
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSpreadsheetToNote(dbSpreadsheet: any): SpreadsheetNote {
  const spreadsheetType = dbSpreadsheet.metadata?.spreadsheetType || "custom";
  const preview = getSpreadsheetSubtitle(spreadsheetType, dbSpreadsheet.status);

  return {
    id: dbSpreadsheet._id,
    title: dbSpreadsheet.title,
    preview,
    type: "spreadsheet",
    content:
      typeof dbSpreadsheet.data === "string"
        ? dbSpreadsheet.data
        : JSON.stringify(dbSpreadsheet.data || {}, null, 2),
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
    api.studio.spreadsheets.index.list,
    notebookId ? { notebookId: notebookId as Id<"notebooks"> } : "skip"
  );
  return spreadsheets?.map(mapSpreadsheetToNote);
}

/**
 * Get a specific spreadsheet by ID
 */
export function useSpreadsheet(spreadsheetId: string | null) {
  const spreadsheet = useQuery(
    api.studio.spreadsheets.index.get,
    spreadsheetId ? { id: spreadsheetId as Id<"spreadsheets"> } : "skip"
  );
  return spreadsheet ? mapSpreadsheetToNote(spreadsheet) : null;
}

/**
 * Create a new spreadsheet and queue generation
 */
export function useCreateSpreadsheet() {
  const schedule = useAction(api.studio.scheduling.spreadsheets.scheduleSpreadsheet);

  return async (params: CreateSpreadsheetParams): Promise<CreateSpreadsheetResponse> => {
    const result = await schedule({
      notebookId: params.notebookId as Id<"notebooks">,
      documentIds: params.documentIds as Id<"documents">[],
      title: params.title,
      spreadsheetType: params.spreadsheetType,
      customPrompt: params.customPrompt,
    });

    return {
      spreadsheetId: result.spreadsheetId,
      status: result.status,
      spreadsheet: mapSpreadsheetToNote({
        ...result.spreadsheet,
        metadata: { spreadsheetType: params.spreadsheetType, documentIds: params.documentIds },
      }),
    };
  };
}

/**
 * Rename a spreadsheet by ID with optimistic update
 */
export function useRenameSpreadsheet() {
  const update = useMutation(api.studio.spreadsheets.index.update).withOptimisticUpdate(
    (localStore, args) => {
      const { id, title } = args;

      // Read the current spreadsheet to get its notebookId
      const spreadsheet = localStore.getQuery(api.studio.spreadsheets.index.get, { id });
      if (spreadsheet) {
        // Update detail view
        localStore.setQuery(api.studio.spreadsheets.index.get, { id }, { ...spreadsheet, title });

        // Update list view using the notebookId from the item
        const listResult = localStore.getQuery(api.studio.spreadsheets.index.list, {
          notebookId: spreadsheet.notebookId,
        });
        if (listResult) {
          localStore.setQuery(
            api.studio.spreadsheets.index.list,
            { notebookId: spreadsheet.notebookId },
            listResult.map((ss: { _id: string; [key: string]: unknown }) =>
              ss._id === id ? { ...ss, title } : ss
            )
          );
        }
      }
    }
  );

  return async (spreadsheetId: string, newTitle: string) => {
    return await update({
      id: spreadsheetId as Id<"spreadsheets">,
      title: newTitle,
    });
  };
}

/**
 * Delete a spreadsheet by ID with optimistic update
 */
export function useDeleteSpreadsheet() {
  const remove = useMutation(api.studio.spreadsheets.index.remove).withOptimisticUpdate(
    (localStore, args) => {
      // Read the current spreadsheet to get its notebookId
      const spreadsheet = localStore.getQuery(api.studio.spreadsheets.index.get, { id: args.id });
      if (spreadsheet) {
        // Update list view using the notebookId from the item
        const listResult = localStore.getQuery(api.studio.spreadsheets.index.list, {
          notebookId: spreadsheet.notebookId,
        });
        if (listResult) {
          localStore.setQuery(
            api.studio.spreadsheets.index.list,
            { notebookId: spreadsheet.notebookId },
            listResult.filter((ss: { _id: string }) => ss._id !== args.id)
          );
        }
      }

      // Clear detail view
      localStore.setQuery(api.studio.spreadsheets.index.get, { id: args.id }, null);
    }
  );

  return async (spreadsheetId: string) => {
    await remove({ id: spreadsheetId as Id<"spreadsheets"> });
  };
}

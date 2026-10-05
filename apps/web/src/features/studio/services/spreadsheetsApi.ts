import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation } from "convex/react";
import type { SpreadsheetNote } from "@/shared/types/index";
import { patchNoteInNotesCache, removeNoteFromNotesCache } from "./notesCache";

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
    literature_review: "Literature Review",
  };
  return labels[spreadsheetType] || "Spreadsheet";
}

/**
 * Get subtitle for spreadsheet based on status and type
 */
function getSpreadsheetSubtitle(spreadsheetType: string, status?: string): string {
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
    (localStore, { id, title }) => {
      patchNoteInNotesCache(localStore, id, { title });
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
    (localStore, { id }) => {
      removeNoteFromNotesCache(localStore, id);
    }
  );

  return async (spreadsheetId: string) => {
    await remove({ id: spreadsheetId as Id<"spreadsheets"> });
  };
}

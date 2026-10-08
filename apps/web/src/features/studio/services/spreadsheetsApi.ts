import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { useAction, useMutation } from "convex/react";
import { useCallback, useMemo } from "react";
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
      editedAt: dbSpreadsheet.metadata?.editedAt,
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
 * Patch one spreadsheet in the cached notes queries the Studio panel reads
 * (see `patchNoteInNotesCache`). `data` is only patched into `notes.index.get`,
 * since list rows never carry it; `title` goes into both.
 */
export function patchSpreadsheetInNotesCache(
  localStore: OptimisticLocalStore,
  id: string,
  patch: { title?: string; data?: string }
): void {
  patchNoteInNotesCache(localStore, id, patch);
}

/** The tail of each spreadsheet's save chain; an entry is removed once its chain drains. */
const spreadsheetSaveQueues = new Map<string, Promise<unknown>>();

/**
 * Run `run` after every save already queued for this spreadsheet, so saves for
 * one id reach the server one at a time and in call order, even across a sheet
 * that was closed and reopened. A failed save doesn't stop the ones behind it.
 */
export function enqueueSpreadsheetSave<T>(id: string, run: () => Promise<T>): Promise<T> {
  const previous = spreadsheetSaveQueues.get(id) ?? Promise.resolve();
  const result = previous.then(run);
  const tail = result.then(
    () => undefined,
    () => undefined
  );
  spreadsheetSaveQueues.set(id, tail);
  void tail.then(() => {
    if (spreadsheetSaveQueues.get(id) === tail) spreadsheetSaveQueues.delete(id);
  });
  return result;
}

/** Whether a save for this spreadsheet is queued or running. */
export function isSpreadsheetSaveQueued(id: string): boolean {
  return spreadsheetSaveQueues.has(id);
}

/**
 * Rename a spreadsheet by ID with optimistic update
 */
export function useRenameSpreadsheet() {
  const updateMutation = useMutation(api.studio.spreadsheets.index.update);
  const update = useMemo(
    () =>
      updateMutation.withOptimisticUpdate((localStore, { id, title }) => {
        patchNoteInNotesCache(localStore, id, { title });
      }),
    [updateMutation]
  );

  return useCallback(
    async (spreadsheetId: string, newTitle: string) => {
      return await update({
        id: spreadsheetId as Id<"spreadsheets">,
        title: newTitle,
      });
    },
    [update]
  );
}

/**
 * Save a spreadsheet's CSV with an optimistic update. Saves for one spreadsheet
 * run strictly in call order (see `enqueueSpreadsheetSave`). The server stamps
 * `metadata.editedAt`, which arrives through the query.
 */
export function useSaveSpreadsheetData() {
  const update = useMutation(api.studio.spreadsheets.index.update).withOptimisticUpdate(
    (localStore, { id, data }) => {
      if (data !== undefined) patchSpreadsheetInNotesCache(localStore, id, { data });
    }
  );

  return (spreadsheetId: string, data: string): Promise<unknown> =>
    enqueueSpreadsheetSave(spreadsheetId, () =>
      update({ id: spreadsheetId as Id<"spreadsheets">, data })
    );
}

/**
 * Delete a spreadsheet by ID with optimistic update
 */
export function useDeleteSpreadsheet() {
  const removeMutation = useMutation(api.studio.spreadsheets.index.remove);
  const remove = useMemo(
    () =>
      removeMutation.withOptimisticUpdate((localStore, { id }) => {
        removeNoteFromNotesCache(localStore, id);
      }),
    [removeMutation]
  );

  return useCallback(
    async (spreadsheetId: string) => {
      await remove({ id: spreadsheetId as Id<"spreadsheets"> });
    },
    [remove]
  );
}

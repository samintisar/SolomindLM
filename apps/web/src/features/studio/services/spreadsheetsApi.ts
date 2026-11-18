import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { useAction } from "convex/react";
import { useCallback } from "react";
import {
  patchNoteInNotesCache,
  removeFromNotesCache,
  renameInNotesCache,
  useOptimisticMutation,
} from "./notesCache";

export interface CreateSpreadsheetParams {
  notebookId: string;
  documentIds: string[];
  title?: string;
  spreadsheetType?: string;
  customPrompt?: string;
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
 * Create a new spreadsheet and queue generation
 */
export function useCreateSpreadsheet() {
  const schedule = useAction(api.studio.scheduling.spreadsheets.scheduleSpreadsheet);

  return useCallback(
    async (params: CreateSpreadsheetParams) => {
      const result = await schedule({
        notebookId: params.notebookId as Id<"notebooks">,
        documentIds: params.documentIds as Id<"documents">[],
        title: params.title,
        spreadsheetType: params.spreadsheetType,
        customPrompt: params.customPrompt,
      });
      return { id: result.spreadsheetId, status: result.status };
    },
    [schedule]
  );
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
  const update = useOptimisticMutation(api.studio.spreadsheets.index.update, renameInNotesCache);

  return useCallback(
    async (spreadsheetId: string, newTitle: string) => {
      await update({ id: spreadsheetId as Id<"spreadsheets">, title: newTitle });
    },
    [update]
  );
}

function patchSpreadsheetDataInNotesCache(
  localStore: OptimisticLocalStore,
  { id, data }: { id: string; data?: string }
): void {
  if (data !== undefined) patchSpreadsheetInNotesCache(localStore, id, { data });
}

/**
 * Save a spreadsheet's CSV with an optimistic update. Saves for one spreadsheet
 * run strictly in call order (see `enqueueSpreadsheetSave`). The server stamps
 * `metadata.editedAt`, which arrives through the query.
 */
export function useSaveSpreadsheetData() {
  const update = useOptimisticMutation(
    api.studio.spreadsheets.index.update,
    patchSpreadsheetDataInNotesCache
  );

  return useCallback(
    (spreadsheetId: string, data: string): Promise<unknown> =>
      enqueueSpreadsheetSave(spreadsheetId, () =>
        update({ id: spreadsheetId as Id<"spreadsheets">, data })
      ),
    [update]
  );
}

/**
 * Delete a spreadsheet by ID with optimistic update
 */
export function useDeleteSpreadsheet() {
  const remove = useOptimisticMutation(api.studio.spreadsheets.index.remove, removeFromNotesCache);

  return useCallback(
    async (spreadsheetId: string) => {
      await remove({ id: spreadsheetId as Id<"spreadsheets"> });
    },
    [remove]
  );
}

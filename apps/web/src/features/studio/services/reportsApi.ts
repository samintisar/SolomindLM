import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { useAction } from "convex/react";
import { useCallback } from "react";
import { patchNoteInNotesCache, removeFromNotesCache, useOptimisticMutation } from "./notesCache";

export interface CreateReportParams {
  notebookId: string;
  documentIds: string[];
  reportType: string;
  customPrompt?: string;
}

/**
 * Create a new report and queue generation
 */
export function useCreateReport() {
  const schedule = useAction(api.studio.scheduling.reports.scheduleReport);

  return useCallback(
    async (params: CreateReportParams) => {
      const result = await schedule({
        notebookId: params.notebookId as Id<"notebooks">,
        documentIds: params.documentIds as Id<"documents">[],
        reportType: params.reportType,
        customPrompt: params.customPrompt,
      });
      return { id: result.reportId, status: result.status };
    },
    [schedule]
  );
}

function patchReportInNotesCache(
  localStore: OptimisticLocalStore,
  { id, ...updates }: { id: string; title?: string; content?: string }
): void {
  patchNoteInNotesCache(localStore, id, updates);
}

/**
 * Update a report (e.g. title or content) with optimistic update
 */
export function useUpdateReport() {
  const update = useOptimisticMutation(api.studio.reports.index.update, patchReportInNotesCache);

  return useCallback(
    async (reportId: string, updates: { title?: string; content?: string }) => {
      await update({ id: reportId as Id<"reports">, ...updates });
    },
    [update]
  );
}

/**
 * Delete a report by ID with optimistic update
 */
export function useDeleteReport() {
  const remove = useOptimisticMutation(api.studio.reports.index.remove, removeFromNotesCache);

  return useCallback(
    async (reportId: string) => {
      await remove({ id: reportId as Id<"reports"> });
    },
    [remove]
  );
}

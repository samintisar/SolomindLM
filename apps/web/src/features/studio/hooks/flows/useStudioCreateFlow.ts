import { useCallback } from "react";
import { useToast } from "@/shared/contexts/useToast";
import type { Note } from "@/shared/types/index";
import { useStudioGenerationCatch } from "../useStudioGenerationCatch";
import { confirmStudioContextBudget } from "./studioContextGuard";
import { getStudioGenerationBlocker } from "./studioGenerationGuard";
import type { CreateFlowContext } from "./types";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A list row before it has an id or status. */
export type NotePlaceholder = DistributiveOmit<Note, "id" | "status">;

export interface StudioCreateFlowConfig<TConfig> {
  /** What gets generated, as in "Please select at least one source to generate {noun}". */
  noun: string;
  /** The list row shown while the job is being scheduled (id and status are filled in). */
  buildPlaceholder: (config: TConfig, documentIds: string[]) => NotePlaceholder;
  /** Schedules the job; resolves to the saved item's id and status. */
  start: (
    config: TConfig,
    target: { notebookId: string; documentIds: string[] }
  ) => Promise<{ id: string; status: string }>;
  errorCopy: {
    /** Toast when scheduling fails for a reason other than a plan limit. */
    toast: string;
    /** Console label for the failure. */
    dev: string;
  };
}

/**
 * The shared create flow behind every Studio tool: check the source selection, sign-in and
 * context budget, show a placeholder row, schedule the job, then swap the placeholder for the
 * saved id (or remove it and explain the failure).
 */
export function useStudioCreateFlow<TConfig>(
  ctx: CreateFlowContext,
  { noun, buildPlaceholder, start, errorCopy }: StudioCreateFlowConfig<TConfig>
) {
  const catchGenerationError = useStudioGenerationCatch();
  const { error: showErrorToast } = useToast();

  return useCallback(
    async (config: TConfig) => {
      const documentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (documentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm(
            "No Sources Selected",
            `Please select at least one source to generate ${noun}`,
            { variant: "warning" }
          );
        }
        return;
      }
      const blocker = getStudioGenerationBlocker(ctx);
      if (blocker) {
        showErrorToast(blocker);
        return;
      }
      if (!(await confirmStudioContextBudget(ctx))) {
        return;
      }

      const placeholderId = Math.random().toString(36).slice(2, 11);
      const placeholder = {
        ...buildPlaceholder(config, documentIds),
        id: placeholderId,
        status: "generating",
      } as Note;

      ctx.onAddNote(placeholder);

      try {
        const { id, status } = await start(config, {
          notebookId: ctx.notebookId!,
          documentIds,
        });
        ctx.onUpdateNoteFull?.(placeholderId, { ...placeholder, id, status } as Note);
      } catch (error) {
        await catchGenerationError(error, {
          placeholderId,
          onDeleteNote: ctx.onDeleteNote,
          toastMessage: errorCopy.toast,
          devLabel: errorCopy.dev,
        });
      }
    },
    [ctx, noun, buildPlaceholder, start, errorCopy, catchGenerationError, showErrorToast]
  );
}

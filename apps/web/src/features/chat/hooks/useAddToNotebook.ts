import type { Id } from "@convex/_generated/dataModel";
import { useCallback } from "react";
import { useAddExternalSources } from "@/features/sources/services/documentsApi";
import { useToast } from "@/shared/contexts/useToast";
import type { ExternalSource } from "@/shared/types/index";

interface AddToNotebookMessages {
  /** Success toast for `added` new sources (the mutation skips URLs already in the notebook). */
  added: (added: number) => string;
  failed: string;
}

/**
 * Add web/academic results to the notebook as sources, with success and failure toasts.
 * Resolves true when the mutation succeeded.
 */
export function useAddToNotebook(notebookId: string | null | undefined) {
  const addExternalSources = useAddExternalSources();
  const { success, error: toastError } = useToast();

  return useCallback(
    async (sources: ExternalSource[], messages: AddToNotebookMessages): Promise<boolean> => {
      if (!notebookId) {
        toastError(messages.failed);
        return false;
      }
      try {
        const ids = await addExternalSources({
          notebookId: notebookId as Id<"notebooks">,
          sources: sources.map(({ title, url, snippet, sourceType }) => ({
            title,
            url,
            snippet,
            sourceType,
          })),
        });
        success(ids.length === 0 ? "Already in this notebook" : messages.added(ids.length));
        return true;
      } catch (e) {
        console.error("Failed to add external sources:", e);
        toastError(messages.failed);
        return false;
      }
    },
    [notebookId, addExternalSources, success, toastError]
  );
}

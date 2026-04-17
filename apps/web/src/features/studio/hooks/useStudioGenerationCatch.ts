import { useCallback } from "react";
import { useLimitErrorToast } from "@/shared/hooks/useLimitErrorToast";
import { useToast } from "@/shared/contexts/ToastContext";

export interface StudioGenerationCatchOptions {
  placeholderId: string;
  onDeleteNote: (id: string) => void;
  /** Short message for the error toast */
  toastMessage: string;
  /** Optional label for dev-only console logging */
  devLabel?: string;
}

/**
 * Shared catch handler for Studio generation mutations: limit errors → friendly toast (+ optional upgrade),
 * other errors → generic toast (no browser alert, minimal console noise).
 */
export function useStudioGenerationCatch() {
  const { handleLimitError } = useLimitErrorToast();
  const { error: showErrorToast } = useToast();

  return useCallback(
    async (error: unknown, options: StudioGenerationCatchOptions) => {
      const { isLimitError } = await handleLimitError(error);
      if (!isLimitError) {
        if (import.meta.env.DEV) {
          console.error(options.devLabel ?? options.toastMessage, error);
        }
        showErrorToast(options.toastMessage);
      }
      options.onDeleteNote(options.placeholderId);
    },
    [handleLimitError, showErrorToast]
  );
}

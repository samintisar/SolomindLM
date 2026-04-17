import { useCallback } from "react";
import type { Note, SlideDeckNote } from "@/shared/types/index";
import { useToast } from "@/shared/contexts/ToastContext";
import { useCreateSlideDeck } from "../../services/slidesApi";
import type { SlideDeckConfig } from "../../components/CustomizeSlidesModal";
import { useStudioGenerationCatch } from "../useStudioGenerationCatch";
import type { CreateFlowContext } from "./types";

export function useCreateSlidesFlow(ctx: CreateFlowContext) {
  const createSlideDeck = useCreateSlideDeck();
  const catchGenerationError = useStudioGenerationCatch();
  const { error: showErrorToast } = useToast();

  return useCallback(
    async (config: SlideDeckConfig) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm(
            "No Sources Selected",
            "Please select at least one source to generate a slide deck",
            { variant: "warning" }
          );
        }
        return;
      }
      if (!ctx.userId || !ctx.noteId) {
        showErrorToast("Please sign in again to continue.");
        return;
      }

      const typeLabel = config.slideType === "detailed_deck" ? "Detailed" : "Presenter";
      const lengthLabel = config.deckLength === "short" ? "Short" : "Standard";

      const placeholderId = Math.random().toString(36).slice(2, 11);
      const newNote: Note = {
        id: placeholderId,
        title: "Slide Deck",
        preview: `${typeLabel} • ${lengthLabel}`,
        type: "slides",
        slides: [],
        status: "generating",
        metadata: {
          slideType: config.slideType,
          deckLength: config.deckLength,
          slideCount: 0,
          customPrompt: config.customPrompt,
        },
      };

      ctx.onAddNote(newNote);

      try {
        const slideCount = config.deckLength === "short" ? 5 : 10;
        const { slideDeckId, slideDeck } = await createSlideDeck({
          notebookId: ctx.noteId,
          documentIds: selectedDocumentIds,
          slideCount,
          title: "Slide Deck",
        });

        const initialNote: SlideDeckNote = {
          ...slideDeck,
          id: slideDeckId,
          status: (slideDeck.status ?? "generating") as SlideDeckNote["status"],
          preview: `${typeLabel} • ${lengthLabel}`,
        };

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, initialNote);
        }
      } catch (error) {
        await catchGenerationError(error, {
          placeholderId,
          onDeleteNote: ctx.onDeleteNote,
          toastMessage: "Couldn't start the slide deck. Please try again.",
          devLabel: "Failed to create slide deck",
        });
      }
    },
    [ctx, createSlideDeck, catchGenerationError, showErrorToast]
  );
}

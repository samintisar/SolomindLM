import { useCallback } from "react";
import type { Note, FlashcardNote } from "@/shared/types/index";
import { useToast } from "@/shared/contexts/useToast";
import { useCreateFlashcard } from "../../services/flashcardsApi";
import type { FlashcardConfig } from "../../components/CustomizeFlashcardsModal";
import { useStudioGenerationCatch } from "../useStudioGenerationCatch";
import type { CreateFlowContext } from "./types";

const FLASHCARD_COUNT_MAP = { fewer: 20, standard: 35, more: 55 };

export function useCreateFlashcardsFlow(ctx: CreateFlowContext) {
  const createFlashcards = useCreateFlashcard();
  const catchGenerationError = useStudioGenerationCatch();
  const { error: showErrorToast } = useToast();

  return useCallback(
    async (config: FlashcardConfig) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm(
            "No Sources Selected",
            "Please select at least one source to generate flashcards",
            { variant: "warning" }
          );
        }
        return;
      }
      if (!ctx.userId || !ctx.noteId) {
        showErrorToast("Please sign in again to continue.");
        return;
      }

      const cardCount = FLASHCARD_COUNT_MAP[config.count];
      const placeholderId = Math.random().toString(36).slice(2, 11);
      const newNote: Note = {
        id: placeholderId,
        title: "Flashcards",
        preview: `${cardCount} Cards • ${config.difficulty}`,
        type: "flashcard",
        flashcards: [],
        status: "generating",
        metadata: { cardCount, difficulty: config.difficulty, topic: config.topic },
      };

      ctx.onAddNote(newNote);

      try {
        const res = await createFlashcards({
          notebookId: ctx.noteId,
          documentIds: selectedDocumentIds,
          cardCount,
          difficulty: config.difficulty,
          topic: config.topic || undefined,
        });
        const flashcardId =
          (res as { flashcardId?: string }).flashcardId ?? (res as { noteId?: string }).noteId!;
        const apiNote = (res as { note?: { _id: string; title: string; status: string } }).note;
        const initialNote: FlashcardNote = {
          id: flashcardId,
          title: apiNote?.title ?? "Flashcards",
          preview: `${cardCount} Cards • ${config.difficulty}`,
          type: "flashcard",
          flashcards: [],
          status: (apiNote?.status ?? res.status) as FlashcardNote["status"],
          metadata: { cardCount, difficulty: config.difficulty, topic: config.topic },
        };

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, initialNote);
        }
      } catch (error) {
        await catchGenerationError(error, {
          placeholderId,
          onDeleteNote: ctx.onDeleteNote,
          toastMessage: "Couldn't start flashcards. Please try again.",
          devLabel: "Failed to create flashcards",
        });
      }
    },
    [ctx, createFlashcards, catchGenerationError, showErrorToast]
  );
}

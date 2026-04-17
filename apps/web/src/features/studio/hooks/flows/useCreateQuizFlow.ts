import { useCallback } from "react";
import type { Note, QuizNote } from "@/shared/types/index";
import { useToast } from "@/shared/contexts/ToastContext";
import { useCreateQuiz } from "../../services/quizzesApi";
import type { QuizConfig } from "../../components/CustomizeQuizModal";
import { useStudioGenerationCatch } from "../useStudioGenerationCatch";
import type { CreateFlowContext } from "./types";

export function useCreateQuizFlow(ctx: CreateFlowContext) {
  const createQuiz = useCreateQuiz();
  const catchGenerationError = useStudioGenerationCatch();
  const { error: showErrorToast } = useToast();
  const countMap = { fewer: 10, standard: 20, more: 30 };

  return useCallback(
    async (config: QuizConfig) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm(
            "No Sources Selected",
            "Please select at least one source to generate a quiz",
            { variant: "warning" }
          );
        }
        return;
      }
      if (!ctx.userId || !ctx.noteId) {
        showErrorToast("Please sign in again to continue.");
        return;
      }

      const questionCount = countMap[config.count];
      const placeholderId = Math.random().toString(36).slice(2, 11);
      const newNote: Note = {
        id: placeholderId,
        title: "Quiz",
        preview: `${questionCount} Questions • ${config.difficulty}`,
        type: "quiz",
        questions: [],
        status: "generating",
        metadata: { questionCount, difficulty: config.difficulty, focusArea: config.focus },
      };

      ctx.onAddNote(newNote);

      try {
        const resQuiz = await createQuiz({
          notebookId: ctx.noteId,
          documentIds: selectedDocumentIds,
          questionCount: config.count,
          difficulty: config.difficulty,
          focus: config.focus || undefined,
        });
        const quizId =
          (resQuiz as { quizId?: string }).quizId ?? (resQuiz as { noteId?: string }).noteId!;
        const apiNote = (resQuiz as { note?: { _id: string; title: string; status: string } }).note;
        const initialNote: QuizNote = {
          id: quizId,
          title: apiNote?.title ?? "Quiz",
          preview: `${questionCount} Questions • ${config.difficulty}`,
          type: "quiz",
          questions: [],
          status: (apiNote?.status ?? resQuiz.status) as QuizNote["status"],
          metadata: { questionCount, difficulty: config.difficulty, focusArea: config.focus },
        };

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, initialNote);
        }
      } catch (error) {
        await catchGenerationError(error, {
          placeholderId,
          onDeleteNote: ctx.onDeleteNote,
          toastMessage: "Couldn't start the quiz. Please try again.",
          devLabel: "Failed to create quiz",
        });
      }
    },
    [ctx, createQuiz, catchGenerationError, showErrorToast]
  );
}

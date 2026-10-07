import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation } from "convex/react";
import { useCallback } from "react";
import { removeFromNotesCache, renameInNotesCache, useOptimisticMutation } from "./notesCache";

export interface CreateQuizParams {
  notebookId: string;
  documentIds: string[];
  /** Number of questions to generate (10 / 20 / 30 from the customize modal). */
  questionCount: number;
  difficulty: string; // 'easy', 'medium', 'hard'
  focus?: string;
}

/**
 * Create a new quiz and queue generation
 */
export function useCreateQuiz() {
  const schedule = useAction(api.studio.scheduling.quizzes.scheduleQuiz);

  return useCallback(
    async (params: CreateQuizParams) => {
      const result = await schedule({
        notebookId: params.notebookId as Id<"notebooks">,
        documentIds: params.documentIds as Id<"documents">[],
        questionCount: params.questionCount,
        difficulty: params.difficulty,
        focus: params.focus,
      });
      return { id: result.quizId, status: result.status };
    },
    [schedule]
  );
}

/**
 * Rename a quiz by ID with optimistic update
 */
export function useRenameQuiz() {
  const update = useOptimisticMutation(api.studio.quizzes.index.update, renameInNotesCache);

  return useCallback(
    async (quizId: string, newTitle: string) => {
      await update({ id: quizId as Id<"quizzes">, title: newTitle });
    },
    [update]
  );
}

/**
 * Delete a quiz by ID with optimistic update
 */
export function useDeleteQuiz() {
  const remove = useOptimisticMutation(api.studio.quizzes.index.remove, removeFromNotesCache);

  return useCallback(
    async (quizId: string) => {
      await remove({ id: quizId as Id<"quizzes"> });
    },
    [remove]
  );
}

/**
 * Submit an answer for a quiz question
 */
export function useSubmitQuizAnswer() {
  const submitAnswer = useMutation(api.studio.quizzes.index.submitAnswer);

  return useCallback(
    async (quizId: string, questionIndex: number, selectedOption: number) =>
      await submitAnswer({
        id: quizId as Id<"quizzes">,
        questionIndex,
        selectedOption,
      }),
    [submitAnswer]
  );
}

/**
 * Reset all answers for a quiz
 */
export function useResetQuizAnswers() {
  const update = useMutation(api.studio.quizzes.index.update);

  return useCallback(
    async (quizId: string) =>
      await update({
        id: quizId as Id<"quizzes">,
        metadata: {
          userAnswers: {},
          lastViewedIndex: 0,
        },
      }),
    [update]
  );
}

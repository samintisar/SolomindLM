import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { useAction, useMutation } from "convex/react";
import { useCallback } from "react";
import { removeNoteFromNotesCache, renameInNotesCache, useOptimisticMutation } from "./notesCache";

export interface CreateWrittenQuestionsParams {
  notebookId: string;
  documentIds: string[];
  /** Number of questions to generate (5 / 10 / 15 from the customize modal). */
  questionCount: number;
  difficulty: string; // 'easy', 'medium', 'hard'
  questionType: "short" | "essay";
  focus?: string;
}

export interface SubmitAnswerParams {
  writtenQuestionsId: string;
  questionId: string;
  answer: string;
}

/**
 * Create new written questions and queue generation
 */
export function useCreateWrittenQuestions() {
  const schedule = useAction(api.studio.scheduling.writtenQuestions.scheduleWrittenQuestions);

  return useCallback(
    async (params: CreateWrittenQuestionsParams) => {
      const result = await schedule({
        notebookId: params.notebookId as Id<"notebooks">,
        documentIds: params.documentIds as Id<"documents">[],
        questionCount: params.questionCount,
        difficulty: params.difficulty,
        questionType: params.questionType,
        focus: params.focus,
      });
      return { id: result.writtenQuestionId, status: result.status };
    },
    [schedule]
  );
}

/**
 * Rename written questions by ID with optimistic update
 */
export function useRenameWrittenQuestions() {
  const update = useOptimisticMutation(
    api.studio.writtenQuestions.index.update,
    renameInNotesCache
  );

  return useCallback(
    async (id: string, newTitle: string) => {
      await update({ id: id as Id<"writtenQuestions">, title: newTitle });
    },
    [update]
  );
}

/** The delete mutation names its id `writtenQuestionId`. */
function removeWrittenQuestionsFromNotesCache(
  localStore: OptimisticLocalStore,
  { writtenQuestionId }: { writtenQuestionId: string }
): void {
  removeNoteFromNotesCache(localStore, writtenQuestionId);
}

/**
 * Delete written questions by ID with optimistic update
 */
export function useDeleteWrittenQuestions() {
  const remove = useOptimisticMutation(
    api.studio.writtenQuestions.index.remove,
    removeWrittenQuestionsFromNotesCache
  );

  return useCallback(
    async (id: string) => {
      await remove({ writtenQuestionId: id as Id<"writtenQuestions"> });
    },
    [remove]
  );
}

/**
 * Submit an answer for grading
 */
export function useSubmitWrittenAnswer() {
  const submitAndGrade = useAction(api.studio.writtenQuestions.grading.submitAndGrade);

  return useCallback(
    async (params: SubmitAnswerParams) =>
      await submitAndGrade({
        writtenQuestionsId: params.writtenQuestionsId as Id<"writtenQuestions">,
        questionId: params.questionId,
        answer: params.answer,
      }),
    [submitAndGrade]
  );
}

/**
 * Persist a single question's draft answer text without grading it.
 * Called (debounced) as the user types / navigates so unsubmitted answers
 * are not lost on reload.
 */
export function useSaveWrittenAnswerDraft() {
  const save = useMutation(api.studio.writtenQuestions.index.saveUserAnswerDraft);

  return useCallback(
    async (params: { writtenQuestionsId: string; questionId: string; answer: string }) => {
      return await save({
        id: params.writtenQuestionsId as Id<"writtenQuestions">,
        questionId: params.questionId,
        answer: params.answer,
      });
    },
    [save]
  );
}

/**
 * Reset all answers for a written questions set
 */
export function useResetWrittenAnswers() {
  const update = useMutation(api.studio.writtenQuestions.index.update);

  return useCallback(
    async (id: string) =>
      await update({
        id: id as Id<"writtenQuestions">,
        metadata: {
          userAnswers: {},
          lastViewedIndex: 0,
        },
      }),
    [update]
  );
}

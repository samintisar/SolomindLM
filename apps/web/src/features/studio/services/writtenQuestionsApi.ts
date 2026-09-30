import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import type { WrittenQuestion, WrittenQuestionsNote } from "@/shared/types/index";

export interface CreateWrittenQuestionsParams {
  notebookId: string;
  documentIds: string[];
  questionCount: "fewer" | "standard" | "more"; // 5, 10, 15
  difficulty: string; // 'easy', 'medium', 'hard'
  questionType: "short" | "essay";
  focus?: string;
}

export interface CreateWrittenQuestionsResponse {
  noteId: string;
  status: string;
  note: { _id: string; title: string; status: string };
}

export interface SubmitAnswerParams {
  writtenQuestionsId: string;
  questionId: string;
  answer: string;
}

/** Map 'fewer' | 'standard' | 'more' to API question count (5, 10, 15) */
function questionCountToNumber(count: "fewer" | "standard" | "more"): number {
  const map: Record<string, number> = { fewer: 5, standard: 10, more: 15 };
  return map[count] ?? 10;
}

function capitalizeDifficulty(difficulty: string | undefined): string {
  const d = (difficulty || "medium").toLowerCase();
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/**
 * Matches unified list copy in `notesApi.getWrittenQuestionsPreview`.
 */
function getPreviewText(status: string, questionCount: number, metadata?: any): string {
  const difficulty = capitalizeDifficulty(metadata?.difficulty);

  if (status === "generating") {
    return `${questionCount} Question${questionCount !== 1 ? "s" : ""} · ${difficulty}`;
  }
  if (status === "failed") {
    return `${questionCount} Questions · ${difficulty} · Failed`;
  }
  return `${questionCount} Question${questionCount !== 1 ? "s" : ""} · ${difficulty}`;
}

/**
 * Map a database written questions response to the frontend WrittenQuestionsNote interface
 */
function mapWrittenQuestionsToNote(dbWQ: any): WrittenQuestionsNote {
  // Questions are stored in the questionsData field
  const questions: WrittenQuestion[] = dbWQ.questionsData || [];
  const questionCount = questions.length;

  return {
    id: dbWQ._id,
    title: dbWQ.title,
    preview: getPreviewText(dbWQ.status, questionCount, dbWQ.metadata),
    type: "writtenQuestions" as const,
    questions,
    userAnswers: dbWQ.metadata?.userAnswers || {},
    status: dbWQ.status,
    metadata: {
      questionCount,
      difficulty: dbWQ.metadata?.difficulty || "medium",
      questionType: dbWQ.metadata?.questionType || "short",
      focusArea: dbWQ.metadata?.focus,
      lastViewedIndex: dbWQ.metadata?.lastViewedIndex,
    },
  };
}

/**
 * Get a specific written questions set by ID
 */
export function useWrittenQuestionSet(id: string | null) {
  const wq = useQuery(
    api.studio.writtenQuestions.index.get,
    id ? { id: id as Id<"writtenQuestions"> } : "skip"
  );
  return wq ? mapWrittenQuestionsToNote(wq) : null;
}

/**
 * Create new written questions and queue generation
 */
export function useCreateWrittenQuestions() {
  const schedule = useAction(api.studio.scheduling.writtenQuestions.scheduleWrittenQuestions);

  return async (params: CreateWrittenQuestionsParams): Promise<CreateWrittenQuestionsResponse> => {
    const result = await schedule({
      notebookId: params.notebookId as Id<"notebooks">,
      documentIds: params.documentIds as Id<"documents">[],
      questionCount: questionCountToNumber(params.questionCount),
      difficulty: params.difficulty,
      questionType: params.questionType,
      focus: params.focus,
    });

    return {
      noteId: result.writtenQuestionId,
      status: result.status,
      note: {
        _id: result.writtenQuestionId,
        title: result.writtenQuestion?.title ?? "",
        status: result.status,
      },
    };
  };
}

/**
 * Rename written questions by ID with optimistic update
 */
export function useRenameWrittenQuestions() {
  const update = useMutation(api.studio.writtenQuestions.index.update).withOptimisticUpdate(
    (localStore, args) => {
      const { id, title } = args;

      // Read the current written questions to get its notebookId
      const wq = localStore.getQuery(api.studio.writtenQuestions.index.get, { id });
      if (wq) {
        // Update detail view
        localStore.setQuery(api.studio.writtenQuestions.index.get, { id }, { ...wq, title });

        // Update list view using the notebookId from the item
        const listResult = localStore.getQuery(api.studio.writtenQuestions.index.list, {
          notebookId: wq.notebookId,
        });
        if (listResult) {
          localStore.setQuery(
            api.studio.writtenQuestions.index.list,
            { notebookId: wq.notebookId },
            listResult.map((item: { _id: string; [key: string]: unknown }) =>
              item._id === id ? { ...item, title } : item
            )
          );
        }
      }
    }
  );

  return async (id: string, newTitle: string) => {
    return await update({
      id: id as Id<"writtenQuestions">,
      title: newTitle,
    });
  };
}

/**
 * Delete written questions by ID with optimistic update
 */
export function useDeleteWrittenQuestions() {
  const remove = useMutation(api.studio.writtenQuestions.index.remove).withOptimisticUpdate(
    (localStore, args) => {
      // Read the current written questions to get its notebookId
      const wq = localStore.getQuery(api.studio.writtenQuestions.index.get, {
        id: args.writtenQuestionId,
      });
      if (wq) {
        // Update list view using the notebookId from the item
        const listResult = localStore.getQuery(api.studio.writtenQuestions.index.list, {
          notebookId: wq.notebookId,
        });
        if (listResult) {
          localStore.setQuery(
            api.studio.writtenQuestions.index.list,
            { notebookId: wq.notebookId },
            listResult.filter((item: { _id: string }) => item._id !== args.writtenQuestionId)
          );
        }
      }

      // Clear detail view
      localStore.setQuery(
        api.studio.writtenQuestions.index.get,
        { id: args.writtenQuestionId },
        null
      );
    }
  );

  return async (id: string) => {
    await remove({ writtenQuestionId: id as Id<"writtenQuestions"> });
  };
}

/**
 * Submit an answer for grading
 */
export function useSubmitWrittenAnswer() {
  const submitAndGrade = useAction(api.studio.writtenQuestions.grading.submitAndGrade);

  return async (params: SubmitAnswerParams) => {
    return await submitAndGrade({
      writtenQuestionsId: params.writtenQuestionsId as Id<"writtenQuestions">,
      questionId: params.questionId,
      answer: params.answer,
    });
  };
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

  return async (id: string) => {
    return await update({
      id: id as Id<"writtenQuestions">,
      metadata: {
        userAnswers: {},
        lastViewedIndex: 0,
      },
    });
  };
}

/**
 * Persist written questions progress (last viewed question index)
 * Note: Does NOT use optimistic updates to avoid interfering with questions state
 */
export function useUpdateWrittenQuestionsProgress(
  writtenQuestionsId: string | null,
  currentIndex: number
) {
  const update = useMutation(api.studio.writtenQuestions.index.update);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (writtenQuestionsId == null) return;

    // Debounce the update to avoid excessive API calls during navigation
    timeoutRef.current = setTimeout(() => {
      update({
        id: writtenQuestionsId as Id<"writtenQuestions">,
        metadata: { lastViewedIndex: currentIndex },
      });
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [writtenQuestionsId, currentIndex, update]);
}

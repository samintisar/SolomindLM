import type { QuizQuestion, QuizNote } from "@/shared/types/index";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useEffect, useRef } from "react";

export interface CreateQuizParams {
  notebookId: string;
  documentIds: string[];
  questionCount: "fewer" | "standard" | "more"; // 10, 20, 30
  difficulty: string; // 'easy', 'medium', 'hard'
  focus?: string;
}

export interface CreateQuizResponse {
  noteId: string;
  status: string;
  note: { _id: string; title: string; status: string };
}

/** Map 'fewer' | 'standard' | 'more' to API question count (10, 20, 30) */
function questionCountToNumber(count: "fewer" | "standard" | "more"): number {
  const map: Record<string, number> = { fewer: 10, standard: 20, more: 30 };
  return map[count] ?? 20;
}

/**
 * Get question count label
 */
function getQuestionCountLabel(count: string | number): string {
  if (typeof count === "string") {
    const labels: Record<string, string> = {
      fewer: "10",
      standard: "20",
      more: "30",
    };
    return labels[count] || "20";
  }
  return String(count);
}

function capitalizeDifficulty(difficulty: string | undefined): string {
  const d = (difficulty || "medium").toLowerCase();
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/**
 * Matches unified list copy in `notesApi.getQuizPreview`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPreviewText(status: string, actualQuestionCount: number, metadata?: any): string {
  const phase = metadata?.phase || status;
  const difficulty = capitalizeDifficulty(metadata?.difficulty);

  const isGenerating =
    status === "generating" ||
    phase === "generating" ||
    phase === "mapping" ||
    phase === "collapsing" ||
    phase === "reducing";

  const n =
    actualQuestionCount > 0
      ? actualQuestionCount
      : parseInt(String(getQuestionCountLabel(metadata?.questionCount || "standard")), 10) || 0;

  if (isGenerating) {
    return `${n} Question${n !== 1 ? "s" : ""} · ${difficulty}`;
  }
  if (status === "failed" || phase === "failed") {
    return `${n} Questions · ${difficulty} · Failed`;
  }
  return `${n} Question${n !== 1 ? "s" : ""} · ${difficulty}`;
}

/**
 * Map a database quiz response to the frontend QuizNote interface
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapQuizToNote(dbQuiz: any): QuizNote {
  // Quizzes are stored in the questionsData field
  const questions: QuizQuestion[] = dbQuiz.questionsData || [];
  const questionCount = questions.length;

  return {
    id: dbQuiz._id,
    title: dbQuiz.title,
    preview: getPreviewText(dbQuiz.status, questionCount, dbQuiz.metadata),
    type: "quiz" as const,
    questions,
    userAnswers: dbQuiz.metadata?.userAnswers || {},
    status: dbQuiz.status,
    metadata: {
      questionCount,
      difficulty: dbQuiz.metadata?.difficulty || "medium",
      focusArea: dbQuiz.metadata?.focus,
      lastViewedIndex: dbQuiz.metadata?.lastViewedIndex,
    },
  };
}

/**
 * Get all quizzes for a notebook
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useQuizzes(notebookId: string | null) {
  const quizzes = useQuery(
    api.studio.quizzes.index.list,
    notebookId ? { notebookId: notebookId as Id<"notebooks"> } : "skip"
  );
  return quizzes?.map(mapQuizToNote);
}

/**
 * Get a specific quiz by ID
 */
export function useQuiz(quizId: string | null) {
  const quiz = useQuery(
    api.studio.quizzes.index.get,
    quizId ? { id: quizId as Id<"quizzes"> } : "skip"
  );
  return quiz ? mapQuizToNote(quiz) : null;
}

/**
 * Create a new quiz and queue generation
 */
export function useCreateQuiz() {
  const schedule = useAction(api.studio.scheduling.quizzes.scheduleQuiz);

  return async (params: CreateQuizParams): Promise<CreateQuizResponse> => {
    const result = await schedule({
      notebookId: params.notebookId as Id<"notebooks">,
      documentIds: params.documentIds as Id<"documents">[],
      questionCount: questionCountToNumber(params.questionCount),
      difficulty: params.difficulty,
      focus: params.focus,
    });

    return {
      noteId: result.quizId,
      status: result.status,
      note: { _id: result.quizId, title: result.quiz?.title ?? "", status: result.status },
    };
  };
}

/**
 * Rename a quiz by ID with optimistic update
 */
export function useRenameQuiz() {
  const update = useMutation(api.studio.quizzes.index.update).withOptimisticUpdate(
    (localStore, args) => {
      const { id, title } = args;

      // Get current quiz (has notebookId for list query)
      const quiz = localStore.getQuery(api.studio.quizzes.index.get, { id });
      if (quiz) {
        // Update list view
        const listResult = localStore.getQuery(api.studio.quizzes.index.list, {
          notebookId: quiz.notebookId,
        });
        if (listResult) {
          localStore.setQuery(
            api.studio.quizzes.index.list,
            { notebookId: quiz.notebookId },
            listResult.map((q: { _id: string; [key: string]: unknown }) =>
              q._id === id ? { ...q, title } : q
            )
          );
        }

        // Update detail view
        localStore.setQuery(api.studio.quizzes.index.get, { id }, { ...quiz, title });
      }
    }
  );

  return async (quizId: string, newTitle: string) => {
    return await update({
      id: quizId as Id<"quizzes">,
      title: newTitle,
    });
  };
}

/**
 * Delete a quiz by ID with optimistic update
 */
export function useDeleteQuiz() {
  const remove = useMutation(api.studio.quizzes.index.remove).withOptimisticUpdate(
    (localStore, args) => {
      const quiz = localStore.getQuery(api.studio.quizzes.index.get, { id: args.id });
      if (quiz) {
        const listResult = localStore.getQuery(api.studio.quizzes.index.list, {
          notebookId: quiz.notebookId,
        });
        if (listResult) {
          localStore.setQuery(
            api.studio.quizzes.index.list,
            { notebookId: quiz.notebookId },
            listResult.filter((q: { _id: string }) => q._id !== args.id)
          );
        }
      }

      // Clear detail view
      localStore.setQuery(api.studio.quizzes.index.get, { id: args.id }, null);
    }
  );

  return async (quizId: string) => {
    await remove({ id: quizId as Id<"quizzes"> });
  };
}

/**
 * Submit an answer for a quiz question
 */
export function useSubmitQuizAnswer() {
  const submitAnswer = useMutation(api.studio.quizzes.index.submitAnswer);

  return async (quizId: string, questionIndex: number, selectedOption: number) => {
    return await submitAnswer({
      id: quizId as Id<"quizzes">,
      questionIndex,
      selectedOption,
    });
  };
}

/**
 * Reset all answers for a quiz
 */
export function useResetQuizAnswers() {
  const update = useMutation(api.studio.quizzes.index.update);

  return async (quizId: string) => {
    return await update({
      id: quizId as Id<"quizzes">,
      metadata: {
        userAnswers: {},
        lastViewedIndex: 0,
      },
    });
  };
}

/**
 * Persist quiz progress (last viewed question index)
 * Note: Does NOT use optimistic updates to avoid interfering with quiz state
 */
export function useUpdateQuizProgress(quizId: string | null, currentIndex: number) {
  const update = useMutation(api.studio.quizzes.index.update);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (quizId == null) return;

    // Debounce the update to avoid excessive API calls during navigation
    timeoutRef.current = setTimeout(() => {
      update({
        id: quizId as Id<"quizzes">,
        metadata: { lastViewedIndex: currentIndex },
      });
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [quizId, currentIndex, update]);
}

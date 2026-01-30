import type { Note, QuizQuestion, QuizNote } from '@/shared/types/index';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

export interface CreateQuizParams {
  notebookId: string;
  documentIds: string[];
  questionCount: 'fewer' | 'standard' | 'more'; // 10, 20, 30
  difficulty: string; // 'easy', 'medium', 'hard'
  focus?: string;
}

export interface CreateQuizResponse {
  noteId: string;
  status: string;
  note: { _id: string; title: string; status: string };
}

/** Map 'fewer' | 'standard' | 'more' to API question count (10, 20, 30) */
function questionCountToNumber(count: 'fewer' | 'standard' | 'more'): number {
  const map: Record<string, number> = { fewer: 10, standard: 20, more: 30 };
  return map[count] ?? 20;
}

/**
 * Get question count label
 */
function getQuestionCountLabel(count: string | number): string {
  if (typeof count === 'string') {
    const labels: Record<string, string> = {
      fewer: '10',
      standard: '20',
      more: '30',
    };
    return labels[count] || '20';
  }
  return String(count);
}

/**
 * Get preview text based on status and metadata
 */
function getPreviewText(status: string, metadata?: any): string {
  const phase = metadata?.phase || status;
  const questionCount = metadata?.questionCount || 'standard';
  const difficulty = metadata?.difficulty || 'medium';

  const isGenerating = status === 'generating' ||
    phase === 'generating' ||
    phase === 'mapping' ||
    phase === 'collapsing' ||
    phase === 'reducing';

  if (isGenerating) {
    return `${getQuestionCountLabel(questionCount)} Questions • ${difficulty} • Generating...`;
  }
  if (status === 'failed' || phase === 'failed') {
    return 'Quiz • Failed';
  }
  return `${getQuestionCountLabel(questionCount)} Questions • ${difficulty}`;
}

/**
 * Map a database quiz response to the frontend QuizNote interface
 */
function mapQuizToNote(dbQuiz: any): QuizNote {
  // Quizzes are stored in the questionsData field
  const questions: QuizQuestion[] = dbQuiz.questionsData || [];
  const questionCount = questions.length;

  return {
    id: dbQuiz._id,
    title: dbQuiz.title,
    preview: getPreviewText(dbQuiz.status, dbQuiz.metadata),
    type: 'quiz',
    questions,
    userAnswers: dbQuiz.metadata?.userAnswers || {},
    status: dbQuiz.status,
    metadata: {
      questionCount,
      difficulty: dbQuiz.metadata?.difficulty || 'medium',
      focusArea: dbQuiz.metadata?.focus,
    },
  };
}

/**
 * Get all quizzes for a notebook
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useQuizzes(notebookId: string | null) {
  const quizzes = useQuery(
    api.quizzes.list,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : 'skip'
  );
  return quizzes?.map(mapQuizToNote);
}

/**
 * Get a specific quiz by ID
 */
export function useQuiz(quizId: string | null) {
  const quiz = useQuery(
    api.quizzes.get,
    quizId ? { id: quizId as Id<'quizzes'> } : 'skip'
  );
  return quiz ? mapQuizToNote(quiz) : null;
}

/**
 * Create a new quiz and queue generation
 */
export function useCreateQuiz() {
  const schedule = useAction(api.contentGeneration.scheduleQuiz);

  return async (params: CreateQuizParams): Promise<CreateQuizResponse> => {
    const result = await schedule({
      notebookId: params.notebookId as Id<'notebooks'>,
      documentIds: params.documentIds as Id<'documents'>[],
      questionCount: questionCountToNumber(params.questionCount),
      difficulty: params.difficulty,
      focus: params.focus,
    });

    return {
      noteId: result.quizId,
      status: result.status,
      note: { _id: result.quizId, title: result.quiz?.title ?? '', status: result.status },
    };
  };
}

/**
 * Rename a quiz by ID with optimistic update
 */
export function useRenameQuiz() {
  const update = useMutation(api.quizzes.update).withOptimisticUpdate((localStore, args) => {
    const { id, title } = args;

    // Get current quiz (has notebookId for list query)
    const quiz = localStore.getQuery(api.quizzes.get, { id });
    if (quiz) {
      // Update list view
      const listResult = localStore.getQuery(api.quizzes.list, { notebookId: quiz.notebookId });
      if (listResult) {
        localStore.setQuery(
          api.quizzes.list,
          { notebookId: quiz.notebookId },
          listResult.map(q =>
            q._id === id
              ? { ...q, title }
              : q
          )
        );
      }

      // Update detail view
      localStore.setQuery(
        api.quizzes.get,
        { id },
        { ...quiz, title }
      );
    }
  });

  return async (quizId: string, newTitle: string) => {
    return await update({
      id: quizId as Id<'quizzes'>,
      title: newTitle,
    });
  };
}

/**
 * Delete a quiz by ID with optimistic update
 */
export function useDeleteQuiz() {
  const remove = useMutation(api.quizzes.remove).withOptimisticUpdate((localStore, args) => {
    const quiz = localStore.getQuery(api.quizzes.get, { id: args.id });
    if (quiz) {
      const listResult = localStore.getQuery(api.quizzes.list, { notebookId: quiz.notebookId });
      if (listResult) {
        localStore.setQuery(
          api.quizzes.list,
          { notebookId: quiz.notebookId },
          listResult.filter(q => q._id !== args.id)
        );
      }
    }

    // Clear detail view
    localStore.setQuery(api.quizzes.get, { id: args.id }, null);
  });

  return async (quizId: string) => {
    await remove({ id: quizId as Id<'quizzes'> });
  };
}

/**
 * Submit an answer for a quiz question
 */
export function useSubmitQuizAnswer() {
  const update = useMutation(api.quizzes.update);

  return async (quizId: string, questionIndex: number, selectedOption: number) => {
    return await update({
      id: quizId as Id<'quizzes'>,
      metadata: {
        userAnswers: {
          [questionIndex]: selectedOption,
        },
      },
    });
  };
}

/**
 * Reset all answers for a quiz
 */
export function useResetQuizAnswers() {
  const update = useMutation(api.quizzes.update);

  return async (quizId: string) => {
    return await update({
      id: quizId as Id<'quizzes'>,
      metadata: {
        userAnswers: {},
      },
    });
  };
}

/**
 * Poll quiz status until completion.
 * Pass initialNote from the create response so the first poll succeeds before
 * Convex query reactivity has added the new quiz to the notes list.
 */
export async function pollQuizStatus(
  getQuiz: () => QuizNote | null | undefined,
  onUpdate?: (note: QuizNote) => void,
  maxAttempts = 180, // 6 minutes @ 2s intervals
  interval = 2000,
  initialNote?: QuizNote
): Promise<QuizNote> {
  for (let i = 0; i < maxAttempts; i++) {
    const note = getQuiz() ?? initialNote;

    if (!note) {
      throw new Error('Quiz not found');
    }

    if (note.status === 'completed' || note.status === 'failed') {
      return note;
    }

    onUpdate?.(note);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Quiz generation timed out');
}

/**
 * Legacy API object for backward compatibility
 * @deprecated Use individual hooks instead
 */
export const quizzesApi = {
  useQuizzes,
  useQuiz,
  useCreateQuiz,
  useRenameQuiz,
  useDeleteQuiz,
  useSubmitQuizAnswer,
  useResetQuizAnswers,
  pollQuizStatus,
};

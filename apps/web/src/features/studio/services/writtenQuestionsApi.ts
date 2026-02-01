import type { Note, WrittenQuestion, WrittenQuestionsNote } from '@/shared/types/index';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

export interface CreateWrittenQuestionsParams {
  notebookId: string;
  documentIds: string[];
  questionCount: 'fewer' | 'standard' | 'more'; // 5, 10, 15
  difficulty: string; // 'easy', 'medium', 'hard'
  questionType: 'short' | 'essay';
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

export interface GradedResult {
  score: number;
  maxScore: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
}

/** Map 'fewer' | 'standard' | 'more' to API question count (5, 10, 15) */
function questionCountToNumber(count: 'fewer' | 'standard' | 'more'): number {
  const map: Record<string, number> = { fewer: 5, standard: 10, more: 15 };
  return map[count] ?? 10;
}

/**
 * Get preview text based on status, actual question count, and question type
 */
function getPreviewText(status: string, questionCount: number, questionType: string): string {
  const isGenerating = status === 'generating';

  if (isGenerating) {
    return `${questionCount} Questions • ${questionType} • Generating...`;
  }
  if (status === 'failed') {
    return 'Written Questions • Failed';
  }
  return `${questionCount} Questions • ${questionType}`;
}

/**
 * Map a database written questions response to the frontend WrittenQuestionsNote interface
 */
function mapWrittenQuestionsToNote(dbWQ: any): WrittenQuestionsNote {
  // Questions are stored in the questionsData field
  const questions: WrittenQuestion[] = dbWQ.questionsData || [];
  const questionCount = questions.length;
  const questionType = dbWQ.questionType || dbWQ.metadata?.questionType || 'short';

  return {
    id: dbWQ._id,
    title: dbWQ.title,
    preview: getPreviewText(dbWQ.status, questionCount, questionType),
    type: 'writtenQuestions',
    questions,
    userAnswers: dbWQ.metadata?.userAnswers || {},
    status: dbWQ.status,
    metadata: {
      questionCount,
      difficulty: dbWQ.metadata?.difficulty || 'medium',
      questionType,
      focusArea: dbWQ.metadata?.focus,
    },
  };
}

/**
 * Get all written questions for a notebook
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useWrittenQuestions(notebookId: string | null) {
  const writtenQuestions = useQuery(
    api.writtenQuestions.list,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : 'skip'
  );
  return writtenQuestions?.map(mapWrittenQuestionsToNote);
}

/**
 * Get a specific written questions set by ID
 */
export function useWrittenQuestionSet(id: string | null) {
  const wq = useQuery(
    api.writtenQuestions.get,
    id ? { id: id as Id<'writtenQuestions'> } : 'skip'
  );
  return wq ? mapWrittenQuestionsToNote(wq) : null;
}

/**
 * Create new written questions and queue generation
 */
export function useCreateWrittenQuestions() {
  const schedule = useAction(api.contentGeneration.scheduleWrittenQuestions);

  return async (params: CreateWrittenQuestionsParams): Promise<CreateWrittenQuestionsResponse> => {
    const result = await schedule({
      notebookId: params.notebookId as Id<'notebooks'>,
      documentIds: params.documentIds as Id<'documents'>[],
      questionCount: questionCountToNumber(params.questionCount),
      difficulty: params.difficulty,
      questionType: params.questionType,
      focus: params.focus,
    });

    return {
      noteId: result.writtenQuestionId,
      status: result.status,
      note: { _id: result.writtenQuestionId, title: result.writtenQuestion?.title ?? '', status: result.status },
    };
  };
}

/**
 * Rename written questions by ID with optimistic update
 */
export function useRenameWrittenQuestions() {
  const update = useMutation(api.writtenQuestions.update).withOptimisticUpdate((localStore, args) => {
    const { id, title } = args;

    // Read the current written questions to get its notebookId
    const wq = localStore.getQuery(api.writtenQuestions.get, { id });
    if (wq) {
      // Update detail view
      localStore.setQuery(
        api.writtenQuestions.get,
        { id },
        { ...wq, title }
      );

      // Update list view using the notebookId from the item
      const listResult = localStore.getQuery(api.writtenQuestions.list, { notebookId: wq.notebookId });
      if (listResult) {
        localStore.setQuery(
          api.writtenQuestions.list,
          { notebookId: wq.notebookId },
          listResult.map(item =>
            item._id === id
              ? { ...item, title }
              : item
          )
        );
      }
    }
  });

  return async (id: string, newTitle: string) => {
    return await update({
      id: id as Id<'writtenQuestions'>,
      title: newTitle,
    });
  };
}

/**
 * Delete written questions by ID with optimistic update
 */
export function useDeleteWrittenQuestions() {
  const remove = useMutation(api.writtenQuestions.remove).withOptimisticUpdate((localStore, args) => {
    // Read the current written questions to get its notebookId
    const wq = localStore.getQuery(api.writtenQuestions.get, { id: args.writtenQuestionId });
    if (wq) {
      // Update list view using the notebookId from the item
      const listResult = localStore.getQuery(api.writtenQuestions.list, { notebookId: wq.notebookId });
      if (listResult) {
        localStore.setQuery(
          api.writtenQuestions.list,
          { notebookId: wq.notebookId },
          listResult.filter(item => item._id !== args.writtenQuestionId)
        );
      }
    }

    // Clear detail view
    localStore.setQuery(api.writtenQuestions.get, { id: args.writtenQuestionId }, null);
  });

  return async (id: string) => {
    await remove({ writtenQuestionId: id as Id<'writtenQuestions'> });
  };
}

/**
 * Submit an answer for grading
 */
export function useSubmitWrittenAnswer() {
  const submitAndGrade = useAction(api.writtenQuestionActions.submitAndGrade);

  return async (params: SubmitAnswerParams) => {
    return await submitAndGrade({
      writtenQuestionsId: params.writtenQuestionsId as Id<'writtenQuestions'>,
      questionId: params.questionId,
      answer: params.answer,
    });
  };
}

/**
 * Reset all answers for a written questions set
 */
export function useResetWrittenAnswers() {
  const update = useMutation(api.writtenQuestions.update);

  return async (id: string) => {
    return await update({
      id: id as Id<'writtenQuestions'>,
      metadata: {
        userAnswers: {},
      },
    });
  };
}

/**
 * Get graded result for a specific question
 */
export function useGradedResult(writtenQuestionsId: string | null, questionId: string | null) {
  const wq = useWrittenQuestionSet(writtenQuestionsId);

  if (!wq || !questionId) {
    return null;
  }

  const answer = wq.userAnswers?.[questionId];

  if (!answer || !answer.graded) {
    return null;
  }

  return {
    score: answer.score || 0,
    maxScore: answer.maxScore || 0,
    feedback: answer.feedback || '',
    strengths: answer.strengths || [],
    improvements: answer.improvements || [],
  };
}

/**
 * Poll written questions status until completion.
 * Pass initialNote from the create response so the first poll succeeds before
 * Convex query reactivity has added the new item to the notes list.
 */
export async function pollWrittenQuestionsStatus(
  getWQ: () => WrittenQuestionsNote | null | undefined,
  onUpdate?: (note: WrittenQuestionsNote) => void,
  maxAttempts = 180, // 6 minutes @ 2s intervals
  interval = 2000,
  initialNote?: WrittenQuestionsNote
): Promise<WrittenQuestionsNote> {
  for (let i = 0; i < maxAttempts; i++) {
    const note = getWQ() ?? initialNote;

    if (!note) {
      throw new Error('Written questions not found');
    }

    if (note.status === 'completed' || note.status === 'failed') {
      return note;
    }

    onUpdate?.(note);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Written questions generation timed out');
}

/**
 * Poll for graded result
 */
export async function pollGradedResult(
  getWQ: () => WrittenQuestionsNote | null | undefined,
  questionId: string,
  onUpdate?: (graded: boolean) => void,
  maxAttempts = 60, // 2 minutes @ 2s intervals
  interval = 2000
): Promise<GradedResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const note = getWQ();

    if (!note) {
      throw new Error('Written questions not found');
    }

    const answer = note.userAnswers?.[questionId];

    if (answer?.graded) {
      onUpdate?.(true);
      return {
        score: answer.score || 0,
        maxScore: answer.maxScore || 0,
        feedback: answer.feedback || '',
        strengths: answer.strengths || [],
        improvements: answer.improvements || [],
      };
    }

    onUpdate?.(false);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Grading timed out');
}

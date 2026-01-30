import { useCallback } from 'react';
import type { Note, QuizNote } from '@/shared/types/index';
import { useCreateQuiz, pollQuizStatus } from '../../services/quizzesApi';
import type { QuizConfig } from '../../components/CustomizeQuizModal';
import type { CreateFlowContext } from './types';

export function useCreateQuizFlow(ctx: CreateFlowContext) {
  const createQuiz = useCreateQuiz();
  const countMap = { fewer: 10, standard: 20, more: 30 };

  return useCallback(
    async (config: QuizConfig) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm('No Sources Selected', 'Please select at least one source to generate a quiz', { variant: 'warning' });
        }
        return;
      }
      if (!ctx.userId || !ctx.noteId) {
        alert('Authentication error. Please log in again.');
        return;
      }

      const questionCount = countMap[config.count];
      const placeholderId = Math.random().toString(36).slice(2, 11);
      const newNote: Note = {
        id: placeholderId,
        title: 'Quiz',
        preview: `${questionCount} Questions • ${config.difficulty} • Generating...`,
        type: 'quiz',
        questions: [],
        status: 'generating',
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
        const quizId = (resQuiz as { quizId?: string }).quizId ?? (resQuiz as { noteId?: string }).noteId!;
        const apiNote = (resQuiz as { note?: { _id: string; title: string; status: string } }).note;
        const initialNote: QuizNote = {
          id: quizId,
          title: apiNote?.title ?? 'Quiz',
          preview: `${questionCount} Questions • ${config.difficulty} • Generating...`,
          type: 'quiz',
          questions: [],
          status: (apiNote?.status ?? resQuiz.status) as QuizNote['status'],
          metadata: { questionCount, difficulty: config.difficulty, focusArea: config.focus },
        };

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, initialNote);
        }

        pollQuizStatus(
          () => ctx.notes.find((n) => n.id === quizId) as QuizNote | undefined,
          (updatedNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(quizId, updatedNote);
          },
          180,
          2000,
          initialNote
        )
          .then((finalNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(quizId, finalNote);
          })
          .catch((error) => {
            console.error('Quiz generation failed:', error);
            if (ctx.onUpdateNoteFull) {
              const failedNote = ctx.notes.find((n) => n.id === quizId) || newNote;
              if (failedNote.type === 'quiz') {
                ctx.onUpdateNoteFull(quizId, {
                  ...failedNote,
                  status: 'failed',
                  preview: `${questionCount} Questions • ${config.difficulty} • Failed`,
                  metadata: { ...failedNote.metadata, error: error instanceof Error ? error.message : 'Failed to generate quiz' },
                });
              }
            }
          });
      } catch (error) {
        console.error('Failed to create quiz:', error);
        alert(error instanceof Error ? error.message : 'Failed to create quiz');
        ctx.onDeleteNote(placeholderId);
      }
    },
    [ctx]
  );
}

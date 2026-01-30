import { useCallback } from 'react';
import type { Note, WrittenQuestionsNote } from '@/shared/types/index';
import { useCreateWrittenQuestions, pollWrittenQuestionsStatus } from '../../services/writtenQuestionsApi';
import type { WrittenQuestionsConfig } from '../../components/CustomizeWrittenQuestionsModal';
import type { CreateFlowContext } from './types';

export function useCreateWrittenQuestionsFlow(ctx: CreateFlowContext) {
  const createWrittenQuestions = useCreateWrittenQuestions();
  const countMap = { fewer: 5, standard: 10, more: 15 };

  return useCallback(
    async (config: WrittenQuestionsConfig) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm('No Sources Selected', 'Please select at least one source to generate written questions', { variant: 'warning' });
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
        title: 'Written Questions',
        preview: `${questionCount} Questions • ${config.questionType} • Generating...`,
        type: 'writtenQuestions',
        questions: [],
        status: 'generating',
        metadata: {
          questionCount,
          difficulty: config.difficulty,
          questionType: config.questionType,
          focusArea: config.focus,
        },
      };

      ctx.onAddNote(newNote);

      try {
        const resWQ = await createWrittenQuestions({
          notebookId: ctx.noteId,
          documentIds: selectedDocumentIds,
          questionCount: config.count,
          difficulty: config.difficulty,
          questionType: config.questionType,
          focus: config.focus || undefined,
        });
        const writtenQuestionsId = (resWQ as { writtenQuestionsId?: string }).writtenQuestionsId ?? (resWQ as { noteId?: string }).noteId!;
        const apiNote = (resWQ as { note?: { _id: string; title: string; status: string } }).note;
        const initialNote: WrittenQuestionsNote = {
          id: writtenQuestionsId,
          title: apiNote?.title ?? 'Written Questions',
          preview: `${questionCount} Questions • ${config.questionType} • Generating...`,
          type: 'writtenQuestions',
          questions: [],
          status: (apiNote?.status ?? resWQ.status) as WrittenQuestionsNote['status'],
          metadata: {
            questionCount,
            difficulty: config.difficulty,
            questionType: config.questionType,
            focusArea: config.focus,
          },
        };

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, initialNote);
        }

        pollWrittenQuestionsStatus(
          () => ctx.notes.find((n) => n.id === writtenQuestionsId) as WrittenQuestionsNote | undefined,
          (updatedNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(writtenQuestionsId, updatedNote);
          },
          180,
          2000,
          initialNote
        )
          .then((finalNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(writtenQuestionsId, finalNote);
          })
          .catch((error) => {
            console.error('Written questions generation failed:', error);
            if (ctx.onUpdateNoteFull) {
              const failedNote = ctx.notes.find((n) => n.id === writtenQuestionsId) || newNote;
              if (failedNote.type === 'writtenQuestions') {
                ctx.onUpdateNoteFull(writtenQuestionsId, {
                  ...failedNote,
                  status: 'failed',
                  preview: `${questionCount} Questions • ${config.questionType} • Failed`,
                  metadata: { ...failedNote.metadata, error: error instanceof Error ? error.message : 'Failed to generate written questions' },
                });
              }
            }
          });
      } catch (error) {
        console.error('Failed to create written questions:', error);
        alert(error instanceof Error ? error.message : 'Failed to create written questions');
        ctx.onDeleteNote(placeholderId);
      }
    },
    [ctx]
  );
}

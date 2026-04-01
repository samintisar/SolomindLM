import { useCallback } from 'react';
import type { Note, WrittenQuestionsNote } from '@/shared/types/index';
import { useToast } from '@/shared/contexts/ToastContext';
import { useCreateWrittenQuestions } from '../../services/writtenQuestionsApi';
import type { WrittenQuestionsConfig } from '../../components/CustomizeWrittenQuestionsModal';
import { useStudioGenerationCatch } from '../useStudioGenerationCatch';
import type { CreateFlowContext } from './types';

export function useCreateWrittenQuestionsFlow(ctx: CreateFlowContext) {
  const createWrittenQuestions = useCreateWrittenQuestions();
  const catchGenerationError = useStudioGenerationCatch();
  const { error: showErrorToast } = useToast();
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
        showErrorToast('Please sign in again to continue.');
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
      } catch (error) {
        await catchGenerationError(error, {
          placeholderId,
          onDeleteNote: ctx.onDeleteNote,
          toastMessage: "Couldn't start written questions. Please try again.",
          devLabel: 'Failed to create written questions',
        });
      }
    },
    [ctx, createWrittenQuestions, catchGenerationError, showErrorToast]
  );
}

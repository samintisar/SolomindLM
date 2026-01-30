import { useCallback } from 'react';
import type { Note, FlashcardNote } from '@/shared/types/index';
import { useCreateFlashcards, pollFlashcardStatus } from '../../services/flashcardsApi';
import type { FlashcardConfig } from '../../components/CustomizeFlashcardsModal';
import type { CreateFlowContext } from './types';

export function useCreateFlashcardsFlow(ctx: CreateFlowContext) {
  const createFlashcards = useCreateFlashcards();
  const countMap = { fewer: 20, standard: 35, more: 55 };

  return useCallback(
    async (config: FlashcardConfig) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm('No Sources Selected', 'Please select at least one source to generate flashcards', { variant: 'warning' });
        }
        return;
      }
      if (!ctx.userId || !ctx.noteId) {
        alert('Authentication error. Please log in again.');
        return;
      }

      const cardCount = countMap[config.count];
      const placeholderId = Math.random().toString(36).slice(2, 11);
      const newNote: Note = {
        id: placeholderId,
        title: 'Flashcards',
        preview: `${cardCount} Cards • ${config.difficulty} • Generating...`,
        type: 'flashcard',
        flashcards: [],
        status: 'generating',
        metadata: { cardCount, difficulty: config.difficulty, topic: config.topic },
      };

      ctx.onAddNote(newNote);

      try {
        const res = await createFlashcards({
          notebookId: ctx.noteId,
          documentIds: selectedDocumentIds,
          cardCount,
          difficulty: config.difficulty,
          topic: config.topic || undefined,
        });
        const flashcardId = (res as { flashcardId?: string }).flashcardId ?? (res as { noteId?: string }).noteId!;
        const apiNote = (res as { note?: { _id: string; title: string; status: string } }).note;
        const initialNote: FlashcardNote = {
          id: flashcardId,
          title: apiNote?.title ?? 'Flashcards',
          preview: `${cardCount} Cards • ${config.difficulty} • Generating...`,
          type: 'flashcard',
          flashcards: [],
          status: (apiNote?.status ?? res.status) as FlashcardNote['status'],
          metadata: { cardCount, difficulty: config.difficulty, topic: config.topic },
        };

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, initialNote);
        }

        pollFlashcardStatus(
          () => ctx.notes.find((n) => n.id === flashcardId) as FlashcardNote | undefined,
          (updatedNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(flashcardId, updatedNote);
          },
          180,
          2000,
          initialNote
        )
          .then((finalNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(flashcardId, finalNote);
          })
          .catch((error) => {
            console.error('Flashcard generation failed:', error);
            if (ctx.onUpdateNoteFull) {
              const failedNote = ctx.notes.find((n) => n.id === flashcardId) || newNote;
              if (failedNote.type === 'flashcard') {
                ctx.onUpdateNoteFull(flashcardId, {
                  ...failedNote,
                  status: 'failed',
                  preview: `${cardCount} Cards • ${config.difficulty} • Failed`,
                  metadata: { ...failedNote.metadata, error: error instanceof Error ? error.message : 'Failed to generate flashcards' },
                });
              }
            }
          });
      } catch (error) {
        console.error('Failed to create flashcards:', error);
        alert(error instanceof Error ? error.message : 'Failed to create flashcards');
        ctx.onDeleteNote(placeholderId);
      }
    },
    [ctx]
  );
}

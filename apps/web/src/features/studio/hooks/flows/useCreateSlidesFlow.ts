import { useCallback } from 'react';
import type { Note, SlideDeckNote } from '@/shared/types/index';
import { useCreateSlideDeck, pollSlideDeckStatus } from '../../services/slidesApi';
import type { SlideDeckConfig } from '../../components/CustomizeSlidesModal';
import type { CreateFlowContext } from './types';

export function useCreateSlidesFlow(ctx: CreateFlowContext) {
  const createSlideDeck = useCreateSlideDeck();

  return useCallback(
    async (config: SlideDeckConfig) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm('No Sources Selected', 'Please select at least one source to generate a slide deck', { variant: 'warning' });
        }
        return;
      }
      if (!ctx.userId || !ctx.noteId) {
        alert('Authentication error. Please log in again.');
        return;
      }

      const typeLabel = config.slideType === 'detailed_deck' ? 'Detailed' : 'Presenter';
      const lengthLabel = config.deckLength === 'short' ? 'Short' : 'Standard';

      const placeholderId = Math.random().toString(36).slice(2, 11);
      const newNote: Note = {
        id: placeholderId,
        title: 'Slide Deck',
        preview: `${typeLabel} • ${lengthLabel} • Generating...`,
        type: 'slides',
        slides: [],
        status: 'generating',
        metadata: {
          slideType: config.slideType,
          deckLength: config.deckLength,
          slideCount: 0,
          customPrompt: config.customPrompt,
        },
      };

      ctx.onAddNote(newNote);

      try {
        const slideCount = config.deckLength === 'short' ? 5 : 10;
        const { slideDeckId, slideDeck } = await createSlideDeck({
          notebookId: ctx.noteId,
          documentIds: selectedDocumentIds,
          slideCount,
          title: 'Slide Deck',
        });

        const initialNote: SlideDeckNote = {
          ...slideDeck,
          id: slideDeckId,
          status: (slideDeck.status ?? 'generating') as SlideDeckNote['status'],
          preview: `${typeLabel} • ${lengthLabel} • Generating...`,
        };

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, initialNote);
        }

        pollSlideDeckStatus(
          () => ctx.notes.find((n) => n.id === slideDeckId) as SlideDeckNote | undefined,
          (updatedNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(slideDeckId, updatedNote);
          },
          300, // 10 minutes @ 2s intervals (image generation takes time)
          2000,
          initialNote
        )
          .then((finalNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(slideDeckId, finalNote);
          })
          .catch((error) => {
            console.error('Slide deck generation failed:', error);
            if (ctx.onUpdateNoteFull) {
              const failedNote = ctx.notes.find((n) => n.id === slideDeckId) || newNote;
              if (failedNote.type === 'slides') {
                ctx.onUpdateNoteFull(slideDeckId, {
                  ...failedNote,
                  status: 'failed',
                  preview: `${typeLabel} • ${lengthLabel} • Failed`,
                  metadata: { ...failedNote.metadata, error: error instanceof Error ? error.message : 'Failed to generate slide deck' },
                });
              }
            }
          });
      } catch (error) {
        console.error('Failed to create slide deck:', error);
        alert(error instanceof Error ? error.message : 'Failed to create slide deck');
        ctx.onDeleteNote(placeholderId);
      }
    },
    [ctx]
  );
}

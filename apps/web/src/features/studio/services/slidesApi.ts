import type { Note, Slide, SlideDeckNote } from '@/shared/types/index';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

export interface CreateSlideDeckParams {
  notebookId: string;
  documentIds: string[];
  slideCount: number;
  title?: string;
}

export interface CreateSlideDeckResponse {
  slideDeckId: string;
  status: string;
  slideDeck: SlideDeckNote;
}

export interface SlideDeckConfig {
  slideType: 'detailed_deck' | 'presenter_slides';
  deckLength: 'short' | 'default';
  customPrompt?: string;
}

/**
 * Get preview text based on status and metadata
 */
function getPreviewText(status: string, metadata?: any): string {
  const phase = metadata?.phase || status;
  const slideType = metadata?.slideType || 'detailed_deck';
  const deckLength = metadata?.deckLength || 'default';

  const typeLabel = slideType === 'detailed_deck' ? 'Detailed' : 'Presenter';
  const lengthLabel = deckLength === 'short' ? 'Short' : 'Standard';

  const isGenerating = status === 'generating' ||
    phase === 'generating' ||
    phase === 'mapping' ||
    phase === 'collapsing' ||
    phase === 'reducing';

  if (isGenerating) {
    return `${typeLabel} • ${lengthLabel} • Generating...`;
  }
  if (status === 'failed' || phase === 'failed') {
    return `Slide Deck • Failed`;
  }
  return `${typeLabel} • ${lengthLabel}`;
}

/**
 * Map a database slide deck response to the frontend SlideDeckNote interface
 */
function mapSlideDeckToNote(dbSlideDeck: any): SlideDeckNote {
  // Parse slides from data
  let slides: Slide[] = [];
  if (dbSlideDeck.data) {
    try {
      const parsedData = typeof dbSlideDeck.data === 'string'
        ? JSON.parse(dbSlideDeck.data)
        : dbSlideDeck.data;

      slides = (parsedData.slides || []).map((slide: any) => ({
        slide_number: slide.slide_number,
        slide_url: slide.slide_url || '',
        title: slide.title,
        talking_points: slide.talking_points || [],
        prompt: slide.prompt,
        metadata: slide.metadata || {},
      }));
    } catch {
      slides = [];
    }
  }

  const slideCount = slides.length;

  return {
    id: dbSlideDeck._id,
    title: dbSlideDeck.title,
    preview: getPreviewText(dbSlideDeck.status, dbSlideDeck.metadata),
    type: 'slides',
    slides,
    status: dbSlideDeck.status,
    metadata: {
      slideType: dbSlideDeck.metadata?.slideType || 'detailed_deck',
      deckLength: dbSlideDeck.metadata?.deckLength || 'default',
      slideCount,
      customPrompt: dbSlideDeck.metadata?.customPrompt,
      error: dbSlideDeck.metadata?.error,
    },
  };
}

/**
 * Get all slide decks for a notebook
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useSlideDecks(notebookId: string | null) {
  const slideDecks = useQuery(
    api.slides.list,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : 'skip'
  );
  return slideDecks?.map(mapSlideDeckToNote);
}

/**
 * Get a specific slide deck by ID
 */
export function useSlideDeck(slideDeckId: string | null) {
  const slideDeck = useQuery(
    api.slides.get,
    slideDeckId ? { id: slideDeckId as Id<'slides'> } : 'skip'
  );
  return slideDeck ? mapSlideDeckToNote(slideDeck) : null;
}

/**
 * Create a new slide deck and queue generation
 */
export function useCreateSlideDeck() {
  const generate = useMutation(api.slides.generateSlideDeck);

  return async (params: CreateSlideDeckParams): Promise<CreateSlideDeckResponse> => {
    const result = await generate({
      notebookId: params.notebookId as Id<'notebooks'>,
      documentIds: params.documentIds as Id<'documents'>[],
      slideCount: params.slideCount,
      title: params.title,
    });

    return {
      slideDeckId: result,
      status: 'pending',
      slideDeck: mapSlideDeckToNote({ _id: result, status: 'pending', title: params.title || 'Slide Deck' }),
    };
  };
}

/**
 * Rename a slide deck by ID with optimistic update
 */
export function useRenameSlideDeck() {
  const update = useMutation(api.slides.update).withOptimisticUpdate((localStore, args) => {
    const { id, title } = args;

    // Read the current slide deck to get its notebookId
    const slideDeck = localStore.getQuery(api.slides.get, { id });
    if (slideDeck) {
      // Update detail view
      localStore.setQuery(
        api.slides.get,
        { id },
        { ...slideDeck, title }
      );

      // Update list view using the notebookId from the item
      const listResult = localStore.getQuery(api.slides.list, { notebookId: slideDeck.notebookId });
      if (listResult) {
        localStore.setQuery(
          api.slides.list,
          { notebookId: slideDeck.notebookId },
          listResult.map(sd =>
            sd._id === id
              ? { ...sd, title }
              : sd
          )
        );
      }
    }
  });

  return async (slideDeckId: string, newTitle: string) => {
    return await update({
      id: slideDeckId as Id<'slides'>,
      title: newTitle,
    });
  };
}

/**
 * Delete a slide deck by ID with optimistic update
 */
export function useDeleteSlideDeck() {
  const remove = useMutation(api.slides.remove).withOptimisticUpdate((localStore, args) => {
    // Read the current slide deck to get its notebookId
    const slideDeck = localStore.getQuery(api.slides.get, { id: args.id });
    if (slideDeck) {
      // Update list view using the notebookId from the item
      const listResult = localStore.getQuery(api.slides.list, { notebookId: slideDeck.notebookId });
      if (listResult) {
        localStore.setQuery(
          api.slides.list,
          { notebookId: slideDeck.notebookId },
          listResult.filter(sd => sd._id !== args.id)
        );
      }
    }

    // Clear detail view
    localStore.setQuery(api.slides.get, { id: args.id }, null);
  });

  return async (slideDeckId: string) => {
    await remove({ id: slideDeckId as Id<'slides'> });
  };
}

/**
 * Poll slide deck status until completion.
 * Uses higher maxAttempts for image generation (up to 10 minutes).
 * Pass initialNote from the create response so the first poll succeeds before
 * Convex query reactivity has added the new item to the notes list.
 */
export async function pollSlideDeckStatus(
  getSlideDeck: () => SlideDeckNote | null | undefined,
  onUpdate?: (note: SlideDeckNote) => void,
  maxAttempts = 300, // 10 minutes @ 2s intervals (image generation takes time)
  interval = 2000,
  initialNote?: SlideDeckNote
): Promise<SlideDeckNote> {
  for (let i = 0; i < maxAttempts; i++) {
    const note = getSlideDeck() ?? initialNote;

    if (!note) {
      throw new Error('Slide deck not found');
    }

    if (note.status === 'completed' || note.status === 'failed') {
      return note;
    }

    onUpdate?.(note);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Slide deck generation timed out');
}

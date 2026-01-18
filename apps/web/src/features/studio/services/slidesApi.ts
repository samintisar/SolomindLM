import type { Note, Slide, SlideDeckNote } from '@/shared/types/index';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/shared/utils/api';
import { getUserId } from '@/shared/utils/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface CreateSlideDeckParams {
  userId: string;
  notebookId: string;
  documentIds: string[];
  slideType: 'detailed_deck' | 'presenter_slides';
  deckLength: 'short' | 'default';
  customPrompt?: string;
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
  const slides: Slide[] = (dbSlideDeck.slides || []).map((slide: any) => ({
    slide_number: slide.slide_number,
    slide_url: slide.slide_url || '',
    title: slide.title,
    talking_points: slide.talking_points || [],
    prompt: slide.prompt,
    metadata: slide.metadata || {},
  }));

  const slideCount = slides.length;

  return {
    id: dbSlideDeck.id,
    title: dbSlideDeck.title,
    preview: getPreviewText(dbSlideDeck.status, dbSlideDeck.metadata),
    type: 'slides',
    slides,
    status: dbSlideDeck.status,
    metadata: {
      slideType: dbSlideDeck.slideType || dbSlideDeck.slide_type || 'detailed_deck',
      deckLength: dbSlideDeck.metadata?.deckLength || dbSlideDeck.metadata?.deck_length || 'default',
      slideCount,
      customPrompt: dbSlideDeck.metadata?.customPrompt,
      error: dbSlideDeck.metadata?.error,
    },
  };
}

export const slidesApi = {
  /**
   * Create a new slide deck and queue generation
   */
  async createSlideDeck(params: CreateSlideDeckParams): Promise<CreateSlideDeckResponse> {
    const response = await apiPost('/api/slides', params);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create slide deck');
    }

    const result = await response.json();
    return {
      slideDeckId: result.slideDeckId,
      status: result.status,
      slideDeck: mapSlideDeckToNote(result.slideDeck),
    };
  },

  /**
   * Get a specific slide deck by ID
   */
  async getSlideDeck(slideDeckId: string): Promise<SlideDeckNote> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const queryParams = new URLSearchParams({ userId });
    const response = await apiGet(`/api/slides/${slideDeckId}?${queryParams.toString()}`);

    if (!response.ok) {
      throw new Error('Failed to fetch slide deck');
    }

    const dbSlideDeck = await response.json();
    return mapSlideDeckToNote(dbSlideDeck);
  },

  /**
   * Poll slide deck status until completion
   * Uses higher maxAttempts for image generation (up to 10 minutes)
   */
  async pollSlideDeckStatus(
    slideDeckId: string,
    onUpdate?: (note: SlideDeckNote) => void,
    maxAttempts = 300, // 10 minutes @ 2s intervals (image generation takes time)
    interval = 2000
  ): Promise<SlideDeckNote> {
    for (let i = 0; i < maxAttempts; i++) {
      const note = await this.getSlideDeck(slideDeckId);

      if (note.status === 'completed' || note.status === 'failed') {
        return note;
      }

      onUpdate?.(note);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Slide deck generation timed out');
  },

  /**
   * Get all slide decks for a notebook
   */
  async getSlideDecks(notebookId: string): Promise<SlideDeckNote[]> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiGet(`/api/slides/notebook/${notebookId}?${params.toString()}`);

    if (!response.ok) {
      throw new Error('Failed to fetch slide decks');
    }

    const dbSlideDecks = await response.json();
    return dbSlideDecks.map(mapSlideDeckToNote);
  },

  /**
   * Rename a slide deck by ID
   */
  async renameSlideDeck(slideDeckId: string, newTitle: string): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiPatch(`/api/slides/${slideDeckId}?${params.toString()}`, { title: newTitle });

    if (!response.ok) {
      throw new Error('Failed to rename slide deck');
    }
  },

  /**
   * Delete a slide deck by ID
   */
  async deleteSlideDeck(slideDeckId: string): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    await apiDelete(`/api/slides/${slideDeckId}?${params.toString()}`);
  },
};

import type { Note, Flashcard, FlashcardNote } from '@/shared/types/index';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

export interface CreateFlashcardsParams {
  notebookId: string;
  documentIds: string[];
  cardCount: number; // 20 (fewer), 35 (standard), or 55 (more)
  difficulty: string; // 'easy', 'medium', 'hard'
  topic?: string;
}

export interface CreateFlashcardsResponse {
  noteId: string;
  status: string;
  note: { _id: string; title: string; status: string };
}

/**
 * Get preview text based on status, actual flashcard count, and metadata
 */
function getPreviewText(status: string, cardCount: number, metadata?: any): string {
  const difficulty = metadata?.difficulty || 'medium';

  if (status === 'generating' || status === 'mapping' || status === 'collapsing' || status === 'reducing') {
    return `${cardCount} Cards • ${difficulty} • Generating...`;
  }
  if (status === 'failed') {
    return 'Flashcards • Failed';
  }
  return `${cardCount} Cards • ${difficulty}`;
}

/**
 * Map a database flashcard response to the frontend FlashcardNote interface
 */
function mapFlashcardToNote(dbFlashcard: any): FlashcardNote {
  // Flashcards are stored in the cardsData field
  const flashcards: Flashcard[] = dbFlashcard.cardsData || [];
  const actualCardCount = flashcards.length;

  return {
    id: dbFlashcard._id,
    title: dbFlashcard.title,
    preview: getPreviewText(dbFlashcard.status, actualCardCount, dbFlashcard.metadata),
    type: 'flashcard',
    flashcards,
    status: dbFlashcard.status,
    metadata: {
      difficulty: dbFlashcard.metadata?.difficulty || 'medium',
      cardCount: actualCardCount,
      topic: dbFlashcard.metadata?.topic,
    },
  };
}

/**
 * Get all flashcard sets for a notebook
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useFlashcards(notebookId: string | null) {
  const flashcards = useQuery(
    api.flashcards.list,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : 'skip'
  );
  return flashcards?.map(mapFlashcardToNote);
}

/**
 * Get a specific flashcard set by ID
 */
export function useFlashcard(flashcardId: string | null) {
  const flashcard = useQuery(
    api.flashcards.get,
    flashcardId ? { id: flashcardId as Id<'flashcards'> } : 'skip'
  );
  return flashcard ? mapFlashcardToNote(flashcard) : null;
}

/**
 * Create a new flashcard set and queue generation
 */
export function useCreateFlashcards() {
  const schedule = useAction(api.contentGeneration.scheduleFlashcards);

  return async (params: CreateFlashcardsParams): Promise<CreateFlashcardsResponse> => {
    const result = await schedule({
      notebookId: params.notebookId as Id<'notebooks'>,
      documentIds: params.documentIds as Id<'documents'>[],
      cardCount: params.cardCount,
      difficulty: params.difficulty,
      topic: params.topic,
    });

    return {
      noteId: result.flashcardId,
      status: result.status,
      note: { _id: result.flashcardId, title: result.flashcard?.title ?? '', status: result.status },
    };
  };
}

/**
 * Rename a flashcard set by ID with optimistic update
 */
export function useRenameFlashcards() {
  const update = useMutation(api.flashcards.update).withOptimisticUpdate((localStore, args) => {
    const { id, title } = args;

    // Read the current flashcard to get its notebookId
    const flashcard = localStore.getQuery(api.flashcards.get, { id });
    if (flashcard) {
      // Update detail view
      localStore.setQuery(
        api.flashcards.get,
        { id },
        { ...flashcard, title }
      );

      // Update list view using the notebookId from the item
      const listResult = localStore.getQuery(api.flashcards.list, { notebookId: flashcard.notebookId });
      if (listResult) {
        localStore.setQuery(
          api.flashcards.list,
          { notebookId: flashcard.notebookId },
          listResult.map(fc =>
            fc._id === id
              ? { ...fc, title }
              : fc
          )
        );
      }
    }
  });

  return async (flashcardId: string, newTitle: string) => {
    return await update({
      id: flashcardId as Id<'flashcards'>,
      title: newTitle,
    });
  };
}

/**
 * Delete a flashcard set by ID with optimistic update
 */
export function useDeleteFlashcards() {
  const remove = useMutation(api.flashcards.remove).withOptimisticUpdate((localStore, args) => {
    // Read the current flashcard to get its notebookId
    const flashcard = localStore.getQuery(api.flashcards.get, { id: args.id });
    if (flashcard) {
      // Update list view using the notebookId from the item
      const listResult = localStore.getQuery(api.flashcards.list, { notebookId: flashcard.notebookId });
      if (listResult) {
        localStore.setQuery(
          api.flashcards.list,
          { notebookId: flashcard.notebookId },
          listResult.filter(fc => fc._id !== args.id)
        );
      }
    }

    // Clear detail view
    localStore.setQuery(api.flashcards.get, { id: args.id }, null);
  });

  return async (flashcardId: string) => {
    await remove({ id: flashcardId as Id<'flashcards'> });
  };
}

/**
 * Poll flashcard status until completion.
 * Pass initialNote from the create response so the first poll succeeds before
 * Convex query reactivity has added the new flashcard set to the notes list.
 */
export async function pollFlashcardStatus(
  getFlashcard: () => FlashcardNote | null | undefined,
  onUpdate?: (note: FlashcardNote) => void,
  maxAttempts = 180, // 6 minutes @ 2s intervals
  interval = 2000,
  initialNote?: FlashcardNote
): Promise<FlashcardNote> {
  for (let i = 0; i < maxAttempts; i++) {
    const note = getFlashcard() ?? initialNote;

    if (!note) {
      throw new Error('Flashcard set not found');
    }

    if (note.status === 'completed' || note.status === 'failed') {
      return note;
    }

    onUpdate?.(note);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Flashcard generation timed out');
}

/**
 * Export a flashcard set as CSV
 * This is handled client-side now since we have the flashcard data
 */
export async function exportFlashcardsCSV(flashcardId: string, title: string, flashcards: Flashcard[]): Promise<void> {
  if (flashcards.length === 0) {
    throw new Error('No flashcards to export');
  }

  // Generate CSV content
  const headers = ['Front', 'Back'];
  const rows = flashcards.map(f => [f.front, f.back]);
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  // Create a blob and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  // Generate filename
  const safeTitle = title
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
  link.download = `flashcards_${safeTitle}_${new Date().toISOString().split('T')[0]}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// ============================================================
// Imperative API (for use in event handlers, outside React)
// ============================================================

import { ConvexClient } from 'convex/browser';

// Get or create a singleton Convex client
let convexClient: ConvexClient | null = null;
function getConvexClient(): ConvexClient {
  if (!convexClient) {
    const convexUrl = import.meta.env.VITE_CONVEX_URL;
    if (!convexUrl) {
      throw new Error('VITE_CONVEX_URL environment variable is not set');
    }
    convexClient = new ConvexClient(convexUrl);
  }
  return convexClient;
}

/**
 * Get a flashcard set (imperative version)
 */
export async function getFlashcard(flashcardId: string): Promise<FlashcardNote> {
  const client = getConvexClient();
  const dbFlashcard = await client.query(api.flashcards.get, {
    id: flashcardId as Id<'flashcards'>
  });
  if (!dbFlashcard) {
    throw new Error('Flashcard set not found');
  }
  return mapFlashcardToNote(dbFlashcard);
}

/**
 * Rename a flashcard set (imperative version)
 */
export async function renameFlashcard(flashcardId: string, newTitle: string): Promise<void> {
  const client = getConvexClient();
  await client.mutation(api.flashcards.update, {
    id: flashcardId as Id<'flashcards'>,
    title: newTitle,
  });
}

/**
 * Delete a flashcard set (imperative version)
 */
export async function deleteFlashcard(flashcardId: string): Promise<void> {
  const client = getConvexClient();
  await client.mutation(api.flashcards.remove, {
    id: flashcardId as Id<'flashcards'>
  });
}

/**
 * Get flashcards (imperative version)
 */
export async function getFlashcards(notebookId: string): Promise<FlashcardNote[]> {
  const client = getConvexClient();
  const dbFlashcards = await client.query(api.flashcards.list, {
    notebookId: notebookId as Id<'notebooks'>
  });
  return dbFlashcards?.map(mapFlashcardToNote) ?? [];
}

/**
 * Legacy API object for backward compatibility
 * @deprecated Use individual hooks or functions instead
 */
export const flashcardsApi = {
  createFlashcards: useCreateFlashcards,
  getFlashcard,
  getFlashcards,
  renameFlashcard,
  deleteFlashcard,
  pollFlashcardStatus,
  exportFlashcardsCSV,
};

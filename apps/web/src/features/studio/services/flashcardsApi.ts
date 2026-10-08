import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import type { Flashcard, FlashcardNote } from "@/shared/types/index";
import { downloadBlob } from "@/shared/utils/downloadFile";
import { pickStudioGenerationFields } from "../utils/studioGenerationLabels";
import { patchNoteInNotesCache, removeNoteFromNotesCache } from "./notesCache";

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

function capitalizeDifficulty(difficulty: string | undefined): string {
  const d = (difficulty || "medium").toLowerCase();
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/**
 * Matches unified list copy in `notesApi.getFlashcardPreview`.
 */
function getPreviewText(status: string, cardCount: number, metadata?: any): string {
  const difficulty = capitalizeDifficulty(metadata?.difficulty);

  if (
    status === "generating" ||
    status === "mapping" ||
    status === "collapsing" ||
    status === "reducing"
  ) {
    return `${cardCount} Flashcard${cardCount !== 1 ? "s" : ""} · ${difficulty}`;
  }
  if (status === "failed") {
    return `${cardCount} Flashcards · ${difficulty} · Failed`;
  }
  return `${cardCount} Flashcard${cardCount !== 1 ? "s" : ""} · ${difficulty}`;
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
    type: "flashcard" as const,
    flashcards,
    status: dbFlashcard.status,
    metadata: {
      difficulty: dbFlashcard.metadata?.difficulty || "medium",
      cardCount: actualCardCount,
      topic: dbFlashcard.metadata?.topic,
      lastViewedIndex: dbFlashcard.metadata?.lastViewedIndex,
      ...pickStudioGenerationFields(dbFlashcard.metadata),
    },
  };
}

/**
 * Get a specific flashcard set by ID
 */
export function useFlashcard(flashcardId: string | null) {
  const flashcard = useQuery(
    api.studio.flashcards.index.get,
    flashcardId ? { id: flashcardId as Id<"flashcards"> } : "skip"
  );
  return flashcard ? mapFlashcardToNote(flashcard) : null;
}

/**
 * Create a new flashcard set and queue generation
 */
export function useCreateFlashcard() {
  const schedule = useAction(api.studio.scheduling.flashcards.scheduleFlashcards);

  return async (params: CreateFlashcardsParams): Promise<CreateFlashcardsResponse> => {
    const result = await schedule({
      notebookId: params.notebookId as Id<"notebooks">,
      documentIds: params.documentIds as Id<"documents">[],
      cardCount: params.cardCount,
      difficulty: params.difficulty,
      topic: params.topic,
    });

    return {
      noteId: result.flashcardId,
      status: result.status,
      note: {
        _id: result.flashcardId,
        title: result.flashcard?.title ?? "",
        status: result.status,
      },
    };
  };
}

/**
 * Rename a flashcard set by ID with optimistic update
 */
export function useRenameFlashcard() {
  const update = useMutation(api.studio.flashcards.index.update).withOptimisticUpdate(
    (localStore, { id, title }) => {
      patchNoteInNotesCache(localStore, id, { title });
      // The view also reads the per-type query (live progress) while it is open
      const current = localStore.getQuery(api.studio.flashcards.index.get, { id });
      if (current) {
        localStore.setQuery(api.studio.flashcards.index.get, { id }, { ...current, title });
      }
    }
  );

  return async (flashcardId: string, newTitle: string) => {
    return await update({
      id: flashcardId as Id<"flashcards">,
      title: newTitle,
    });
  };
}

/**
 * Delete a flashcard set by ID with optimistic update
 */
export function useDeleteFlashcard() {
  const remove = useMutation(api.studio.flashcards.index.remove).withOptimisticUpdate(
    (localStore, { id }) => {
      removeNoteFromNotesCache(localStore, id);
      // The view also reads the per-type query (live progress) while it is open
      localStore.setQuery(api.studio.flashcards.index.get, { id }, null);
    }
  );

  return async (flashcardId: string) => {
    await remove({ id: flashcardId as Id<"flashcards"> });
  };
}

/**
 * Persist flashcard progress (last viewed card index)
 * Note: Does NOT use optimistic updates to avoid interfering with flashcard state
 */
export function useUpdateFlashcardProgress(flashcardId: string | null, currentIndex: number) {
  const update = useMutation(api.studio.flashcards.index.update);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (flashcardId == null) return;

    // Debounce the update to avoid excessive API calls during navigation
    timeoutRef.current = setTimeout(() => {
      update({
        id: flashcardId as Id<"flashcards">,
        metadata: { lastViewedIndex: currentIndex },
      });
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [flashcardId, currentIndex, update]);
}

/**
 * Export a flashcard set as CSV
 * This is handled client-side now since we have the flashcard data
 */
export async function exportFlashcardsCSV(
  _flashcardId: string,
  title: string,
  flashcards: Flashcard[]
): Promise<void> {
  if (flashcards.length === 0) {
    throw new Error("No flashcards to export");
  }

  // Generate CSV content
  const headers = ["Front", "Back"];
  const rows = flashcards.map((f) => [f.front, f.back]);
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  // Create a blob and trigger download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  // Generate filename
  const safeTitle = title
    .replace(/[^a-z0-9]/gi, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
  downloadBlob(blob, `flashcards_${safeTitle}_${new Date().toISOString().split("T")[0]}.csv`);
}

// ============================================================================
// NEW HOOKS FOR FLASHCARD FEATURES
// ============================================================================

/**
 * Submit card review for spaced repetition
 */
export function useCardReview() {
  const submitReview = useMutation(api.studio.flashcards.index.submitCardReview);

  return async (
    flashcardId: string,
    cardIndex: number,
    rating: "again" | "hard" | "good" | "easy"
  ) => {
    return await submitReview({
      id: flashcardId as Id<"flashcards">,
      cardIndex,
      rating,
    });
  };
}

/**
 * Get cards that are due for review.
 * `nowMs` is refreshed on an interval so the query re-runs as the clock advances (no Date.now in the Convex query).
 */
export function useDueCards(flashcardId: string | null) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [flashcardId]);

  return useQuery(
    api.studio.flashcards.index.getDueCards,
    flashcardId ? { id: flashcardId as Id<"flashcards">, nowMs } : "skip"
  );
}

/**
 * Update individual card
 */
export function useUpdateCard() {
  const update = useMutation(api.studio.flashcards.index.updateCard);

  return async (
    flashcardId: string,
    cardIndex: number,
    updates: { front?: string; back?: string }
  ) => {
    return await update({
      id: flashcardId as Id<"flashcards">,
      cardIndex,
      ...updates,
    });
  };
}

/**
 * Add new card
 */
export function useAddCard() {
  const add = useMutation(api.studio.flashcards.index.addCard);

  return async (
    flashcardId: string,
    card: { front: string; back: string; topic?: string; type?: Flashcard["type"] }
  ) => {
    return await add({
      id: flashcardId as Id<"flashcards">,
      ...card,
    });
  };
}

/**
 * Delete card
 */
export function useDeleteCard() {
  const deleteCardMutation = useMutation(api.studio.flashcards.index.deleteCard);

  return async (flashcardId: string, cardIndex: number) => {
    return await deleteCardMutation({
      id: flashcardId as Id<"flashcards">,
      cardIndex,
    });
  };
}

/**
 * Update flashcard preferences
 */
export function useUpdateFlashcardPreferences() {
  const update = useMutation(api.studio.flashcards.index.updatePreferences);

  return async (flashcardId: string, preferences: { showMastered?: boolean }) => {
    return await update({
      id: flashcardId as Id<"flashcards">,
      ...preferences,
    });
  };
}

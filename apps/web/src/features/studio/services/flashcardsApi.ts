import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { serializeCsv } from "@convex/_shared/csv.helpers";
import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import type { Flashcard } from "@/shared/types/index";
import { downloadFile } from "@/shared/utils/download";
import { removeFromNotesCache, renameInNotesCache, useOptimisticMutation } from "./notesCache";

export interface CreateFlashcardsParams {
  notebookId: string;
  documentIds: string[];
  cardCount: number; // 20 (fewer), 35 (standard), or 55 (more)
  difficulty: string; // 'easy', 'medium', 'hard'
  topic?: string;
}

/**
 * Create a new flashcard set and queue generation
 */
export function useCreateFlashcard() {
  const schedule = useAction(api.studio.scheduling.flashcards.scheduleFlashcards);

  return useCallback(
    async (params: CreateFlashcardsParams) => {
      const result = await schedule({
        notebookId: params.notebookId as Id<"notebooks">,
        documentIds: params.documentIds as Id<"documents">[],
        cardCount: params.cardCount,
        difficulty: params.difficulty,
        topic: params.topic,
      });
      return { id: result.flashcardId, status: result.status };
    },
    [schedule]
  );
}

/**
 * Rename a flashcard set by ID with optimistic update
 */
export function useRenameFlashcard() {
  const update = useOptimisticMutation(api.studio.flashcards.index.update, renameInNotesCache);

  return useCallback(
    async (flashcardId: string, newTitle: string) => {
      await update({ id: flashcardId as Id<"flashcards">, title: newTitle });
    },
    [update]
  );
}

/**
 * Delete a flashcard set by ID with optimistic update
 */
export function useDeleteFlashcard() {
  const remove = useOptimisticMutation(api.studio.flashcards.index.remove, removeFromNotesCache);

  return useCallback(
    async (flashcardId: string) => {
      await remove({ id: flashcardId as Id<"flashcards"> });
    },
    [remove]
  );
}

/**
 * Download a flashcard set as CSV (built client-side from the cards already loaded).
 */
export function exportFlashcardsCSV(title: string, flashcards: Flashcard[]): void {
  if (flashcards.length === 0) {
    throw new Error("No flashcards to export");
  }

  // Header bare, every card field quoted.
  const csv = [
    serializeCsv([["Front", "Back"]]),
    serializeCsv(
      flashcards.map((f) => [f.front || "", f.back || ""]),
      { quoteAll: true }
    ),
  ].join("\n");

  const safeTitle = title
    .replace(/[^a-z0-9]/gi, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
  const date = new Date().toISOString().split("T")[0];
  downloadFile(csv, `flashcards_${safeTitle}_${date}.csv`, "text/csv;charset=utf-8;");
}

/**
 * Submit card review for spaced repetition
 */
export function useCardReview() {
  const submitReview = useMutation(api.studio.flashcards.index.submitCardReview);

  return useCallback(
    async (flashcardId: string, cardIndex: number, rating: "again" | "hard" | "good" | "easy") =>
      await submitReview({
        id: flashcardId as Id<"flashcards">,
        cardIndex,
        rating,
      }),
    [submitReview]
  );
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

  return useCallback(
    async (flashcardId: string, cardIndex: number, updates: { front?: string; back?: string }) =>
      await update({
        id: flashcardId as Id<"flashcards">,
        cardIndex,
        ...updates,
      }),
    [update]
  );
}

/**
 * Add new card
 */
export function useAddCard() {
  const add = useMutation(api.studio.flashcards.index.addCard);

  return useCallback(
    async (
      flashcardId: string,
      card: { front: string; back: string; topic?: string; type?: Flashcard["type"] }
    ) =>
      await add({
        id: flashcardId as Id<"flashcards">,
        ...card,
      }),
    [add]
  );
}

/**
 * Delete card
 */
export function useDeleteCard() {
  const deleteCardMutation = useMutation(api.studio.flashcards.index.deleteCard);

  return useCallback(
    async (flashcardId: string, cardIndex: number) =>
      await deleteCardMutation({
        id: flashcardId as Id<"flashcards">,
        cardIndex,
      }),
    [deleteCardMutation]
  );
}

/**
 * Update flashcard preferences
 */
export function useUpdateFlashcardPreferences() {
  const update = useMutation(api.studio.flashcards.index.updatePreferences);

  return useCallback(
    async (flashcardId: string, preferences: { showMastered?: boolean }) =>
      await update({
        id: flashcardId as Id<"flashcards">,
        ...preferences,
      }),
    [update]
  );
}

import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect } from "react";

/** The update mutation for each studio type that remembers where the learner was. */
const PROGRESS_MUTATIONS = {
  quiz: api.studio.quizzes.index.update,
  writtenQuestions: api.studio.writtenQuestions.index.update,
  flashcard: api.studio.flashcards.index.update,
} as const;

type ProgressNoteType = keyof typeof PROGRESS_MUTATIONS;

type SaveLastViewedIndex = (args: {
  id: string;
  metadata: { lastViewedIndex: number };
}) => Promise<unknown>;

/** Debounce so stepping through items doesn't send a mutation per step. */
const PROGRESS_SAVE_DELAY_MS = 500;

/**
 * Persist the last viewed item index of a quiz, written-question set or flashcard set (debounced).
 * No optimistic update: the view already holds the index, and patching the open note mid-session
 * would only feed it back.
 */
export function usePersistLastViewedIndex(
  type: ProgressNoteType,
  id: string | null,
  index: number
): void {
  // The three `update` mutations take the same `{ id, metadata }` shape for this call.
  const update = useMutation(PROGRESS_MUTATIONS[type]) as unknown as SaveLastViewedIndex;

  useEffect(() => {
    if (id == null) return;
    const timeout = setTimeout(() => {
      void update({ id, metadata: { lastViewedIndex: index } });
    }, PROGRESS_SAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [id, index, update]);
}

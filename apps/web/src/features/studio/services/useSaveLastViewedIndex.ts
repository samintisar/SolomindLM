import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";

const SAVE_DELAY_MS = 500;

/**
 * Remembers the last card or question viewed through `practice.setLastViewedIndex` (owners save to
 * the item, public notebook viewers to their own progress). Writes 500ms after the position
 * settles, and only when it differs from the saved one, so opening an item writes nothing.
 * Does NOT use optimistic updates, to avoid interfering with the view's own state.
 *
 * @param savedIndex The position the server has saved (what the view restored from).
 */
export function useSaveLastViewedIndex(
  itemType: "flashcards" | "quizzes" | "writtenQuestions",
  itemId: string,
  currentIndex: number,
  savedIndex: number
) {
  const setLastViewedIndex = useMutation(api.studio.practice.setLastViewedIndex);
  const lastWrittenRef = useRef(savedIndex);

  // A newer saved position (the server echo, or a reset) is what is on record now.
  useEffect(() => {
    lastWrittenRef.current = savedIndex;
  }, [savedIndex]);

  useEffect(() => {
    if (currentIndex === lastWrittenRef.current) return;

    const timeout = setTimeout(() => {
      lastWrittenRef.current = currentIndex;
      setLastViewedIndex({ itemType, itemId, index: currentIndex }).catch((err) =>
        console.warn("Failed to save position", err)
      );
    }, SAVE_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [itemType, itemId, currentIndex, setLastViewedIndex]);
}

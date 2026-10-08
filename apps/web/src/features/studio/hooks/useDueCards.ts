import { getDueCardIndices } from "@convex/_lib/srsScheduling";
import { useEffect, useMemo, useState } from "react";
import type { DueFlashcard } from "@/features/studio/components/views/StudyMode";
import type { Flashcard } from "@/shared/types/index";

const CLOCK_TICK_MS = 60_000;

/**
 * Cards due for review, computed from the deck the view already has loaded. The clock ticks once a
 * minute so cards become due as time passes, without opening a new query subscription on each tick
 * (a fresh subscription returns `undefined` until it loads, which blanked the list).
 */
export function useDueCards(cards: Flashcard[]): DueFlashcard[] {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return useMemo(
    () => getDueCardIndices(cards, nowMs).map((index) => ({ index, card: cards[index] })),
    [cards, nowMs]
  );
}

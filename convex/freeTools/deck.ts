// convex/freeTools/deck.ts
"use node";

import {
  heuristicDedupeFlashcards,
  isUsableFlashcard,
} from "../_agents/flashcard/flashcardHeuristics";
import type { Flashcard } from "../_agents/flashcard/prompts";
import { cleanBackText, cleanFrontText } from "../_agents/flashcard/textCleanup";

/** Request more than needed: the usability filter and dedupe usually drop a few. */
export function cardsToRequest(cardCount: number): number {
  return Math.ceil(cardCount * 1.25);
}

/** Same cleanup, defect filter and dedupe the studio pipeline applies, capped at `cardCount`. */
export function buildFreeDeck(raw: Flashcard[], cardCount: number): Flashcard[] {
  const cleaned = raw.map((c) => ({
    ...c,
    front: cleanFrontText(c.front ?? ""),
    back: cleanBackText(c.back ?? ""),
  }));
  const { dedupedFlashcards } = heuristicDedupeFlashcards(cleaned.filter(isUsableFlashcard));
  return dedupedFlashcards.slice(0, cardCount);
}

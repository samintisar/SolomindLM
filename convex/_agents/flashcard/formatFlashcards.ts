"use node";

import type { Flashcard } from "./state.js";

export function formatFlashcardsAsText(flashcards: Flashcard[]): string {
  return flashcards
    .map((card, index) => `${index + 1}. Q: ${card.front}\n   A: ${card.back}`)
    .join("\n\n");
}

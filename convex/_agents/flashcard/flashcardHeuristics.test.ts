import { describe, expect, it } from "vitest";
import { isUsableFlashcard } from "./flashcardHeuristics";
import type { Flashcard } from "./prompts";

function card(front: string, back: string): Flashcard {
  return { type: "fill-blank", front, back };
}

describe("isUsableFlashcard", () => {
  it("keeps a self-contained card that does not reveal its answer", () => {
    expect(isUsableFlashcard(card("Tu ___ à Paris.", "habites"))).toBe(true);
  });

  it("rejects a card missing either side", () => {
    expect(isUsableFlashcard(card("", "habites"))).toBe(false);
    expect(isUsableFlashcard(card("Tu ___ à Paris.", ""))).toBe(false);
  });

  it("rejects a card that points at content the learner cannot see", () => {
    expect(isUsableFlashcard(card("What does the diagram show?", "A cycle."))).toBe(false);
  });

  it("rejects a card whose front gives the answer away", () => {
    expect(isUsableFlashcard(card("Il cherche ___ (ses) clés.", "ses"))).toBe(false);
  });

  it("rejects a card whose blank breaks the sentence", () => {
    expect(isUsableFlashcard(card("Je ___ habite à Paris.", "j'"))).toBe(false);
  });
});

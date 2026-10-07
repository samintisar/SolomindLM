// convex/freeTools/deck.test.ts
import { describe, expect, test } from "vitest";
import type { Flashcard } from "../_agents/flashcard/prompts";
import { buildFreeDeck, cardsToRequest } from "./deck";

const card = (front: string, back: string): Flashcard => ({ type: "wh-question", front, back });

describe("cardsToRequest", () => {
  test("asks for a 25% buffer so filtering still reaches the target", () => {
    expect(cardsToRequest(10)).toBe(13);
    expect(cardsToRequest(20)).toBe(25);
    expect(cardsToRequest(30)).toBe(38);
  });
});

describe("buildFreeDeck", () => {
  test("drops cards with an empty side", () => {
    const deck = buildFreeDeck(
      [card("What produces ATP in the cell?", "Mitochondria"), card("", "x"), card("Q?", "")],
      10
    );
    expect(deck.map((c) => c.front)).toEqual(["What produces ATP in the cell?"]);
  });

  test("drops exact duplicates", () => {
    const a = card("What produces ATP in the cell?", "Mitochondria");
    expect(buildFreeDeck([a, { ...a }], 10)).toHaveLength(1);
  });

  test("caps the deck at cardCount", () => {
    const cards = Array.from({ length: 12 }, (_, i) =>
      card(`What is distinct concept number ${i} about enzymes?`, `Answer ${i}`)
    );
    expect(buildFreeDeck(cards, 10)).toHaveLength(10);
  });
});

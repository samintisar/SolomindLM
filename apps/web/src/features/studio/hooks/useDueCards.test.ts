// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Flashcard } from "@/shared/types/index";
import { useDueCards } from "./useDueCards";

const NOW = new Date("2026-10-08T12:00:00Z").getTime();

function card(front: string, nextReviewDate?: number): Flashcard {
  return {
    front,
    back: `${front} back`,
    type: "basic",
    proficiency:
      nextReviewDate === undefined
        ? undefined
        : { nextReviewDate, interval: 1, easeFactor: 2.5, streak: 1 },
  } as unknown as Flashcard;
}

type Props = { cards: Flashcard[] };

describe("useDueCards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("returns the due cards with their index in the full deck", () => {
    const cards = [card("future", NOW + 60_000), card("new"), card("past", NOW - 1)];
    const { result } = renderHook(() => useDueCards(cards));
    expect(result.current).toEqual([
      { index: 1, card: cards[1] },
      { index: 2, card: cards[2] },
    ]);
  });

  it("keeps the due list defined and steady as the clock ticks", () => {
    const cards = [card("new"), card("past", NOW - 1)];
    const { result } = renderHook(() => useDueCards(cards));
    const before = result.current;
    for (let tick = 0; tick < 3; tick++) {
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(result.current).toEqual(before);
    }
  });

  it("adds a card once its review time passes", () => {
    const cards = [card("soon", NOW + 30_000)];
    const { result } = renderHook(() => useDueCards(cards));
    expect(result.current).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toEqual([{ index: 0, card: cards[0] }]);
  });

  it("shows only the new deck's cards when the deck changes", () => {
    const deckA = [card("A1"), card("A2")];
    const deckB = [card("B1", NOW + 86_400_000), card("B2")];
    const { result, rerender } = renderHook(({ cards }: Props) => useDueCards(cards), {
      initialProps: { cards: deckA },
    });
    expect(result.current.map((d) => d.card.front)).toEqual(["A1", "A2"]);
    rerender({ cards: deckB });
    expect(result.current).toEqual([{ index: 1, card: deckB[1] }]);
  });
});

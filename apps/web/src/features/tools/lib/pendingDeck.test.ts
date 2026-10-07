// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearPendingDeck, readPendingDeck, savePendingDeck } from "./pendingDeck";

const deck = {
  title: "Cells",
  sourceText: "some source text",
  cards: [{ type: "definition" as const, front: "Define: cell", back: "Unit of life" }],
};

describe("pendingDeck", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a saved deck", () => {
    expect(savePendingDeck(deck, 1_000)).toBe(true);
    expect(readPendingDeck(2_000)).toEqual({ ...deck, savedAt: 1_000 });
  });

  it("expires after 24 hours", () => {
    savePendingDeck(deck, 0);
    expect(readPendingDeck(24 * 60 * 60 * 1000 + 1)).toBeNull();
  });

  it("ignores malformed data and clears", () => {
    localStorage.setItem("solomind.freeTool.pendingDeck", "{bad");
    expect(readPendingDeck()).toBeNull();
    savePendingDeck(deck);
    clearPendingDeck();
    expect(readPendingDeck()).toBeNull();
  });
});

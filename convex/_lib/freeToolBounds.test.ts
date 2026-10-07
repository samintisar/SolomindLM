// convex/_lib/freeToolBounds.test.ts
import { describe, expect, test } from "vitest";
import {
  countWords,
  deriveDeckTitle,
  FREE_FLASHCARD_MAX_WORDS,
  FREE_FLASHCARD_MIN_WORDS,
  parseFreeFlashcardRequest,
  truncateToWords,
} from "./freeToolBounds";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("countWords", () => {
  test("counts whitespace-separated words", () => {
    expect(countWords("  one two\nthree\t four ")).toBe(4);
  });
  test("is zero for blank text", () => {
    expect(countWords("   \n ")).toBe(0);
  });
});

describe("truncateToWords", () => {
  test("keeps text under the cap unchanged", () => {
    expect(truncateToWords("a b c", 5)).toEqual({ text: "a b c", truncated: false });
  });
  test("cuts after the Nth word and keeps original whitespace", () => {
    expect(truncateToWords("a  b\n\nc d e", 3)).toEqual({ text: "a  b\n\nc", truncated: true });
  });
});

describe("deriveDeckTitle", () => {
  test("uses the first line with letters, without markdown heading marks", () => {
    expect(deriveDeckTitle("\n\n# Cell Biology: Mitochondria\nBody text")).toBe(
      "Cell Biology: Mitochondria"
    );
  });
  test("caps long titles at a word boundary", () => {
    const title = deriveDeckTitle(`${"Photosynthesis ".repeat(20)}\nrest`);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith(" ")).toBe(false);
  });
  test("falls back to Flashcards", () => {
    expect(deriveDeckTitle("12 34\n--")).toBe("Flashcards");
  });
});

describe("parseFreeFlashcardRequest", () => {
  const valid = {
    text: words(FREE_FLASHCARD_MIN_WORDS),
    cardCount: 20,
    turnstileToken: "tok",
  };

  test("accepts a valid body", () => {
    expect(parseFreeFlashcardRequest(valid)).toEqual({ ok: true, value: valid });
  });
  test("rejects non-objects", () => {
    expect(parseFreeFlashcardRequest(null)).toEqual({ ok: false, error: "invalid_body" });
  });
  test("rejects a card count outside 10/20/30", () => {
    expect(parseFreeFlashcardRequest({ ...valid, cardCount: 25 })).toEqual({
      ok: false,
      error: "invalid_body",
    });
  });
  test("rejects a missing token", () => {
    expect(parseFreeFlashcardRequest({ ...valid, turnstileToken: "" })).toEqual({
      ok: false,
      error: "missing_token",
    });
  });
  test("rejects short text", () => {
    expect(
      parseFreeFlashcardRequest({ ...valid, text: words(FREE_FLASHCARD_MIN_WORDS - 1) })
    ).toEqual({ ok: false, error: "text_too_short" });
  });
  test("rejects long text", () => {
    expect(
      parseFreeFlashcardRequest({ ...valid, text: words(FREE_FLASHCARD_MAX_WORDS + 1) })
    ).toEqual({ ok: false, error: "text_too_long" });
  });
});

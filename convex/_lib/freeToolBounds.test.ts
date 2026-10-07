// convex/_lib/freeToolBounds.test.ts
import { describe, expect, test } from "vitest";
import {
  countWords,
  deriveDeckTitle,
  FREE_FLASHCARD_MAX_WORDS,
  FREE_FLASHCARD_MIN_WORDS,
  parseFreeFlashcardRequest,
  TURNSTILE_TOKEN_MAX_CHARS,
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
  test("counts each Han, Kana or Thai character as a word", () => {
    expect(countWords("能量转换")).toBe(4);
    expect(countWords("カタカナ ひらがな 変換")).toBe(10);
    expect(countWords("พลังงาน")).toBe(7);
  });
  test("counts mixed text: runs of other scripts stay one word", () => {
    expect(countWords("ATP是能量")).toBe(4);
    expect(countWords("the ATP 是 energy")).toBe(4);
  });
});

describe("truncateToWords", () => {
  test("keeps text under the cap unchanged", () => {
    expect(truncateToWords("a b c", 5)).toEqual({ text: "a b c", truncated: false });
  });
  test("cuts after the Nth word and keeps original whitespace", () => {
    expect(truncateToWords("a  b\n\nc d e", 3)).toEqual({ text: "a  b\n\nc", truncated: true });
  });
  test("cuts Chinese text after N characters", () => {
    expect(truncateToWords("能量转换过程", 4)).toEqual({ text: "能量转换", truncated: true });
    expect(truncateToWords("ATP是能量", 2)).toEqual({ text: "ATP是", truncated: true });
    expect(truncateToWords("能量", 2)).toEqual({ text: "能量", truncated: false });
  });
  test("a non-positive cap yields empty text", () => {
    expect(truncateToWords("a b", 0)).toEqual({ text: "", truncated: true });
    expect(truncateToWords("a b", -1)).toEqual({ text: "", truncated: true });
    expect(truncateToWords("  ", 0)).toEqual({ text: "", truncated: false });
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
  test("trims and strips heading marks with or without a space", () => {
    expect(deriveDeckTitle("   # Heading")).toBe("Heading");
    expect(deriveDeckTitle("#Heading")).toBe("Heading");
  });
  test("strips list markers, checkboxes and emphasis", () => {
    expect(deriveDeckTitle("- [ ] **Bold** item")).toBe("Bold item");
    expect(deriveDeckTitle("1. __Numbered__ title")).toBe("Numbered title");
    expect(deriveDeckTitle("> Quoted title")).toBe("Quoted title");
  });
  test("never cuts a surrogate pair when capping long titles", () => {
    const title = deriveDeckTitle(`Cells${"😀".repeat(100)}`);
    expect(title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(title).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    expect(Array.from(title).length).toBeLessThanOrEqual(80);
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
  test("rejects an oversized turnstile token", () => {
    expect(
      parseFreeFlashcardRequest({
        ...valid,
        turnstileToken: "x".repeat(TURNSTILE_TOKEN_MAX_CHARS + 1),
      })
    ).toEqual({ ok: false, error: "invalid_body" });
    expect(
      parseFreeFlashcardRequest({
        ...valid,
        turnstileToken: "x".repeat(TURNSTILE_TOKEN_MAX_CHARS),
      }).ok
    ).toBe(true);
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

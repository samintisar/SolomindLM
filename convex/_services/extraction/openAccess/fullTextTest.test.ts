import { describe, expect, it } from "vitest";
import { countWords, FULL_TEXT_MIN_WORDS, isFullTextLength } from "./fullTextTest";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("countWords", () => {
  it("counts whitespace-separated words, ignoring surrounding and repeated whitespace", () => {
    expect(countWords("  one\ttwo\n\nthree  ")).toBe(3);
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("isFullTextLength", () => {
  it("rejects text shorter than the minimum", () => {
    expect(isFullTextLength(words(FULL_TEXT_MIN_WORDS - 1), "")).toBe(false);
  });

  it("accepts text at the minimum when there is no abstract", () => {
    expect(isFullTextLength(words(FULL_TEXT_MIN_WORDS), undefined)).toBe(true);
  });

  it("needs at least three times the abstract's length", () => {
    const abstract = words(600);
    expect(isFullTextLength(words(1_700), abstract)).toBe(false);
    expect(isFullTextLength(words(1_800), abstract)).toBe(true);
  });
});

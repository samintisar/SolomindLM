import { describe, expect, it } from "vitest";
import {
  FULL_TEXT_MIN_WORDS,
  isFullTextLength,
  isPlausiblePdfText,
  PDF_TEXT_MIN_WORDS,
} from "./fullTextTest";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

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

  it("counts Chinese text without spaces by character", () => {
    expect(isFullTextLength("研究".repeat(FULL_TEXT_MIN_WORDS), "")).toBe(true);
  });
});

describe("isPlausiblePdfText", () => {
  it("rejects a cover-page-sized PDF", () => {
    expect(isPlausiblePdfText(words(PDF_TEXT_MIN_WORDS - 1), "")).toBe(false);
    expect(isPlausiblePdfText(words(PDF_TEXT_MIN_WORDS), "")).toBe(true);
  });

  it("needs at least twice the abstract's length", () => {
    const abstract = words(400);
    expect(isPlausiblePdfText(words(700), abstract)).toBe(false);
    expect(isPlausiblePdfText(words(800), abstract)).toBe(true);
  });
});

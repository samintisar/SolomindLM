/**
 * The rule for "is this scraped page the paper's full text?" (#480). A landing page or paywall
 * usually carries the abstract and some navigation; a full article is far longer than both.
 * OCR of a real PDF doesn't go through this test.
 */

export const FULL_TEXT_MIN_WORDS = 1_500;
export const FULL_TEXT_ABSTRACT_MULTIPLE = 3;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function isFullTextLength(text: string, abstract: string | undefined): boolean {
  const n = countWords(text);
  return n >= FULL_TEXT_MIN_WORDS && n >= FULL_TEXT_ABSTRACT_MULTIPLE * countWords(abstract ?? "");
}

/**
 * The rule for "is this scraped page the paper's full text?" (#480). A landing page or paywall
 * usually carries the abstract and some navigation; a full article is far longer than both.
 * OCR of an open-access PDF passes a lower bar (`isPlausiblePdfText`); a PDF the user uploaded isn't tested.
 */

import { countWords } from "../../../_lib/freeToolBounds";

export const FULL_TEXT_MIN_WORDS = 1_500;
export const FULL_TEXT_ABSTRACT_MULTIPLE = 3;
/** A one-page cover sheet, notice or "request a copy" form is shorter than this. */
export const PDF_TEXT_MIN_WORDS = 500;

export function isFullTextLength(text: string, abstract: string | undefined): boolean {
  const n = countWords(text);
  return n >= FULL_TEXT_MIN_WORDS && n >= FULL_TEXT_ABSTRACT_MULTIPLE * countWords(abstract ?? "");
}

/** Whether OCR text from an open-access PDF reads as the paper rather than a cover page. */
export function isPlausiblePdfText(text: string, abstract: string | undefined): boolean {
  const n = countWords(text);
  return n >= PDF_TEXT_MIN_WORDS && n >= 2 * countWords(abstract ?? "");
}

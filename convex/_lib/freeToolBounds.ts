// convex/_lib/freeToolBounds.ts
/**
 * Bounds for the free no-signup flashcard tool (/tools/pdf-to-flashcards).
 * Pure module: imported by the Convex HTTP handler and by the web page (`@convex/_lib/freeToolBounds`),
 * so client-side validation and server-side enforcement use the same numbers.
 */

export const FREE_FLASHCARD_MIN_WORDS = 80;
export const FREE_FLASHCARD_MAX_WORDS = 12_000;
/** Request body cap. ~12k words of prose is ~80 KB; this leaves room for long words and JSON. */
export const FREE_FLASHCARD_MAX_BODY_BYTES = 200_000;
export const FREE_FLASHCARD_MAX_PDF_PAGES = 40;
export const FREE_FLASHCARD_CARD_COUNTS = [10, 20, 30] as const;
export type FreeFlashcardCardCount = (typeof FREE_FLASHCARD_CARD_COUNTS)[number];
export const FREE_FLASHCARD_DEFAULT_CARD_COUNT: FreeFlashcardCardCount = 20;
/** Runs per hashed IP per day. */
export const FREE_FLASHCARD_IP_DAILY_LIMIT = 3;
/** All anonymous runs per day: the cost circuit breaker. */
export const FREE_FLASHCARD_GLOBAL_DAILY_LIMIT = 300;
export const FREE_FLASHCARD_LLM_TIMEOUT_MS = 90_000;

const TITLE_MAX_CHARS = 80;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Keep the first `maxWords` words, preserving the original whitespace between them. */
export function truncateToWords(
  text: string,
  maxWords: number
): { text: string; truncated: boolean } {
  const wordPattern = /\S+/g;
  let count = 0;
  let match: RegExpExecArray | null = wordPattern.exec(text);
  while (match) {
    count++;
    if (count === maxWords) {
      const end = match.index + match[0].length;
      const rest = text.slice(end);
      return /\S/.test(rest)
        ? { text: text.slice(0, end), truncated: true }
        : { text, truncated: false };
    }
    match = wordPattern.exec(text);
  }
  return { text, truncated: false };
}

/** First line that contains letters, minus markdown heading marks, capped at a word boundary. */
export function deriveDeckTitle(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^#{1,6}\s+/, "").trim())
    .find((l) => /\p{L}{2,}/u.test(l));
  if (!line) return "Flashcards";
  if (line.length <= TITLE_MAX_CHARS) return line;
  const cut = line.slice(0, TITLE_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

export type FreeFlashcardRequest = {
  text: string;
  cardCount: FreeFlashcardCardCount;
  turnstileToken: string;
};

export type FreeFlashcardRequestError =
  | "invalid_body"
  | "missing_token"
  | "text_too_short"
  | "text_too_long";

export type FreeFlashcardRequestParse =
  | { ok: true; value: FreeFlashcardRequest }
  | { ok: false; error: FreeFlashcardRequestError };

export function parseFreeFlashcardRequest(body: unknown): FreeFlashcardRequestParse {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };
  const { text, cardCount, turnstileToken } = body as Record<string, unknown>;
  if (typeof text !== "string" || typeof turnstileToken !== "string") {
    return { ok: false, error: "invalid_body" };
  }
  if (!FREE_FLASHCARD_CARD_COUNTS.includes(cardCount as FreeFlashcardCardCount)) {
    return { ok: false, error: "invalid_body" };
  }
  if (!turnstileToken.trim()) return { ok: false, error: "missing_token" };
  const wordCount = countWords(text);
  if (wordCount < FREE_FLASHCARD_MIN_WORDS) return { ok: false, error: "text_too_short" };
  if (wordCount > FREE_FLASHCARD_MAX_WORDS) return { ok: false, error: "text_too_long" };
  return {
    ok: true,
    value: { text, cardCount: cardCount as FreeFlashcardCardCount, turnstileToken },
  };
}

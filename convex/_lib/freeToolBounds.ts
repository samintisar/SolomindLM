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
/**
 * Attempts = LLM calls, failures and timeouts included, reserved atomically before each call.
 * These are the hard cost bound: worst-case daily spend is the global attempts cap × one call.
 */
export const FREE_FLASHCARD_IP_DAILY_ATTEMPTS = 6;
export const FREE_FLASHCARD_GLOBAL_DAILY_ATTEMPTS = 600;
export const FREE_FLASHCARD_LLM_TIMEOUT_MS = 90_000;

const TITLE_MAX_CHARS = 80;
/** Generous for a Turnstile token (they are ~1–2 KB); stops the field being used to carry payload. */
export const TURNSTILE_TOKEN_MAX_CHARS = 2048;

/**
 * Word tokens. Chinese, Japanese and Thai are written without spaces, so each Han / Hiragana /
 * Katakana / Thai character counts as one token; any other run of non-whitespace characters is one
 * token. Shared by `countWords` and `truncateToWords` so counting and cutting always agree.
 */
const TOKEN_SOURCE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]+/u
    .source;

export function countWords(text: string): number {
  return text.match(new RegExp(TOKEN_SOURCE, "gu"))?.length ?? 0;
}

/** Keep the first `maxWords` word tokens, preserving the original whitespace between them. */
export function truncateToWords(
  text: string,
  maxWords: number
): { text: string; truncated: boolean } {
  if (maxWords <= 0) return { text: "", truncated: text.trim() !== "" };
  const wordPattern = new RegExp(TOKEN_SOURCE, "gu");
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

/** Strip markdown noise (heading, list/quote marker, checkbox, bold/underline emphasis) from a line. */
function cleanTitleLine(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^([-*+>]|\d+[.)])\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/(\*\*|__)/g, "")
    .trim();
}

/** First line that contains letters, minus markdown marks, capped at a word boundary. */
export function deriveDeckTitle(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map(cleanTitleLine)
    .find((l) => /\p{L}{2,}/u.test(l));
  if (!line) return "Flashcards";
  const codePoints = Array.from(line);
  if (codePoints.length <= TITLE_MAX_CHARS) return line;
  const cut = codePoints.slice(0, TITLE_MAX_CHARS).join("");
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
  if (turnstileToken.length > TURNSTILE_TOKEN_MAX_CHARS) {
    return { ok: false, error: "invalid_body" };
  }
  const wordCount = countWords(text);
  if (wordCount < FREE_FLASHCARD_MIN_WORDS) return { ok: false, error: "text_too_short" };
  if (wordCount > FREE_FLASHCARD_MAX_WORDS) return { ok: false, error: "text_too_long" };
  return {
    ok: true,
    value: { text, cardCount: cardCount as FreeFlashcardCardCount, turnstileToken },
  };
}

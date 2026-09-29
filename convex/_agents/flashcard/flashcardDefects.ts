/**
 * Deterministic checks for flashcards that test nothing or read wrong.
 *
 * - `answer_in_front`: the front already contains the answer, either as a
 *   parenthetical ("Il cherche ___ (ses) clés" → "ses") or, for fill-in-the-blank
 *   cards, written out elsewhere in the prompt.
 * - `blank_duplicates_neighbor`: substituting the answer into the blank repeats
 *   the word beside it ("Je ___ habite" → "j'" reads "Je j'habite").
 *
 * Language-agnostic: works on Unicode word tokens, never on topic vocabulary.
 * Kept free of `"use node"` so both Convex actions and evals can import it.
 */

export type FlashcardDefect = "answer_in_front" | "blank_duplicates_neighbor";

const BLANK = /_{2,}/g;
const PARENTHETICAL = /\(([^()]*)\)/g;
/** Text after one of these explains the answer rather than being the answer. */
const ANSWER_EXPLANATION_SEPARATOR = /\s[-–—]\s|[:;(\n]|\.\s|,\s/;
/** A parenthetical with these offers choices ("la/le"), which is a legitimate hint. */
const CHOICE_SEPARATOR = /[/|]/;
/** Single-word answers shorter than this (articles, pronouns) recur in normal sentences. */
const MIN_STANDALONE_ANSWER_LENGTH = 4;
const WORD = /[\p{L}\p{N}]+(?:'[\p{L}\p{N}]*)*/gu;

function tokenize(text: string): string[] {
  return text.normalize("NFC").toLowerCase().replace(/[’‘`]/g, "'").match(WORD) ?? [];
}

function coreAnswerTokens(back: string): string[] {
  return tokenize(back.trim().split(ANSWER_EXPLANATION_SEPARATOR)[0] ?? "");
}

function startsWithTokens(haystack: string[], prefix: string[]): boolean {
  return prefix.length > 0 && prefix.every((token, i) => haystack[i] === token);
}

function containsTokens(haystack: string[], needle: string[]): boolean {
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (startsWithTokens(haystack.slice(i), needle)) return true;
  }
  return false;
}

function hasParentheticalAnswer(front: string, answer: string[]): boolean {
  for (const [, inner] of front.matchAll(PARENTHETICAL)) {
    if (CHOICE_SEPARATOR.test(inner)) continue;
    if (startsWithTokens(tokenize(inner), answer)) return true;
  }
  return false;
}

function hasWrittenOutAnswer(front: string, answer: string[]): boolean {
  const isDistinctive =
    answer.length >= 2 || (answer[0]?.length ?? 0) >= MIN_STANDALONE_ANSWER_LENGTH;
  if (!isDistinctive) return false;
  const withoutBlanksOrHints = front.replace(PARENTHETICAL, " ").replace(BLANK, " ");
  return containsTokens(tokenize(withoutBlanksOrHints), answer);
}

/** "j'" after "je", "I'm" after "I": the elided answer restates the previous word. */
function isElisionOf(answerToken: string, previous: string): boolean {
  const apostrophe = answerToken.indexOf("'");
  if (apostrophe <= 0) return false;
  return previous.startsWith(answerToken.slice(0, apostrophe));
}

function blankDuplicatesNeighbor(front: string, answer: string[]): boolean {
  const pieces = front.replace(PARENTHETICAL, " ").split(BLANK);
  if (pieces.length !== 2) return false;
  const previous = tokenize(pieces[0]).at(-1);
  const next = tokenize(pieces[1])[0];
  const first = answer[0];
  const last = answer[answer.length - 1];
  if (previous && (first === previous || isElisionOf(first, previous))) return true;
  return next !== undefined && last === next;
}

export function findFlashcardDefect(card: { front: string; back: string }): FlashcardDefect | null {
  const answer = coreAnswerTokens(card.back);
  if (answer.length === 0) return null;

  if (hasParentheticalAnswer(card.front, answer)) return "answer_in_front";

  const hasBlank = card.front.search(BLANK) !== -1;
  if (!hasBlank) return null;
  if (hasWrittenOutAnswer(card.front, answer)) return "answer_in_front";
  if (blankDuplicatesNeighbor(card.front, answer)) return "blank_duplicates_neighbor";
  return null;
}

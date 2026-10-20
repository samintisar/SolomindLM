/**
 * Pack source text as judge evidence, shared by the rubric and binary judges. Used when an
 * artifact has no retrieved chunks (studio runners).
 */
import type { SourceText } from "../usecases/types";

/**
 * Whole-pack source text: fits every current pack in full (the largest, Researchers, is about
 * 226K characters, roughly 60K tokens). A judge that sees only part of a paper fails values that
 * are in the part it never saw.
 */
export const SOURCE_TEXTS_LIMIT = 240_000;
export const CUT_NOTE =
  "Do not fail the check only because a value is missing from a document that was cut off.";

/**
 * Split `limit` chars evenly across documents; budget a short document leaves unused goes to the
 * rest. A document that is cut says how much of it is shown.
 */
export function formatSourceTexts(
  texts: SourceText[],
  limit: number
): { text: string; truncated: boolean } {
  if (texts.length === 0) return { text: "", truncated: false };
  const budgets = new Array<number>(texts.length);
  let remaining = limit;
  const shortestFirst = texts
    .map((_, i) => i)
    .sort((a, b) => texts[a].text.length - texts[b].text.length);
  shortestFirst.forEach((i, done) => {
    budgets[i] = Math.min(texts[i].text.length, Math.floor(remaining / (texts.length - done)));
    remaining -= budgets[i];
  });
  const text = texts
    .map((t, i) => {
      const cut = budgets[i] < t.text.length;
      const label = cut ? ` (first ${budgets[i]} of ${t.text.length} characters shown)` : "";
      return `[${t.fileName}]${label}\n${t.text.slice(0, budgets[i])}`;
    })
    .join("\n\n---\n\n");
  return { text, truncated: budgets.some((b, i) => b < texts[i].text.length) };
}

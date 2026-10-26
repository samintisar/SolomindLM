import { pickSpread } from "./collapsePlan";

/**
 * Text a Studio item's title is written from (#556). Titles were written from the first 2,000
 * characters of the output, which is mostly the first source's part, so a digest of 13 papers was
 * titled after one of them. This samples short lines evenly across the whole item (questions,
 * card fronts, section headings, one line per source) and puts the user's request first.
 */

/** Characters the title model reads (`generateTitleFromChunk`). */
export const TITLE_SOURCE_MAX_CHARS = 1_500;
const ITEM_MAX_CHARS = 120;
const REQUEST_MAX_CHARS = 200;

function firstLine(text: string): string {
  const line =
    text
      .split("\n")
      .map((l) => l.replace(/^(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)+/, "").trim())
      .find(Boolean) ?? "";
  return line.length > ITEM_MAX_CHARS ? `${line.slice(0, ITEM_MAX_CHARS - 1)}…` : line;
}

export function titleSourceFromItems(
  items: string[],
  options: { request?: string; maxChars?: number } = {}
): string {
  const maxChars = options.maxChars ?? TITLE_SOURCE_MAX_CHARS;
  const request = options.request?.trim().slice(0, REQUEST_MAX_CHARS);
  const header = request ? `Request: ${request}\n` : "";
  const lines = items.map(firstLine).filter(Boolean);
  if (lines.length === 0) return header.trim();

  // As many evenly spaced lines as fit, so the sample spans the whole item.
  const budget = maxChars - header.length;
  let count = lines.length;
  let picked = lines;
  while (count > 1) {
    picked = pickSpread(lines, count);
    if (picked.reduce((n, l) => n + l.length + 3, 0) <= budget) break;
    count = Math.max(1, Math.floor(count * 0.8));
  }
  if (count === 1) picked = pickSpread(lines, 1);
  return `${header}${picked.map((l) => `- ${l}`).join("\n")}`.slice(0, maxChars);
}

/** The headings of a Markdown document, or its paragraphs when it has none. */
export function markdownTitleItems(markdown: string): string[] {
  const headings = markdown
    .split("\n")
    .filter((line) => /^#{1,3}\s+\S/.test(line))
    .map((line) => line.replace(/^#+\s+/, ""));
  if (headings.length >= 2) return headings;
  return markdown.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
}

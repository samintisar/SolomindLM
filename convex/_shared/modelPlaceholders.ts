/**
 * Bracketed placeholders a model writes for itself and never fills in (#574): "[Image of a
 * supply curve]", "[Diagram: ...]", "[text]", "[citation needed]". Nothing renders them, so
 * they read as broken content. Citations ("[1]"), links ("[a](b)"), indexing ("xs[0]") and
 * code are left alone.
 */

import { normalizeMathMarkdown } from "./mathMarkdown";

/** Placeholders for a picture the model wanted shown: "[Image of …]", "[Figure: …]". */
const VISUAL_PLACEHOLDER =
  /(?<![\w\]])\[(?:image|diagram|figure|chart|graph|illustration|photo|picture|visual|insert)\b[^\]\n]{0,200}\](?![([:])/gi;

/** Template slots left empty: "[text]", "[citation needed]". */
const EMPTY_SLOT =
  /(?<![\w\]])\[(?:text|citation|citation needed|source|source needed|insert citation|link|url|placeholder|todo)\](?![([:])/gi;

/** Inline code and fenced blocks, which keep their brackets. */
const CODE_SEGMENT = /(```[\s\S]*?```|`[^`\n]*`)/;

function stripSegment(text: string): string {
  const stripped = text.replace(VISUAL_PLACEHOLDER, "").replace(EMPTY_SLOT, "");
  if (stripped === text) return text;
  return stripped
    .replace(/[ \t]+([.,;:!?)])/g, "$1")
    .replace(/\([ \t]*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "");
}

export function stripModelPlaceholders(text: string): string {
  if (!text || !text.includes("[")) return text;
  return text
    .split(CODE_SEGMENT)
    .map((segment) => (segment.startsWith("`") ? segment : stripSegment(segment)))
    .join("");
}

/** Save-time cleanup for Studio text: placeholders out, then the shared math normalization. */
export function normalizeStudioMarkdown(content: string): string {
  return normalizeMathMarkdown(stripModelPlaceholders(content));
}

/** `normalizeStudioMarkdown` on every string inside a value (cards, questions, sections). */
export function normalizeStudioMarkdownDeep<T>(value: T): T {
  return mapStrings(value, normalizeStudioMarkdown);
}

/**
 * `stripModelPlaceholders` on every string inside a value, for Studio data that isn't Markdown
 * (mind map nodes, spreadsheet tables).
 */
export function stripModelPlaceholdersDeep<T>(value: T): T {
  return mapStrings(value, stripModelPlaceholders);
}

/** One walk over a value, applying `fn` to each string. */
function mapStrings<T>(value: T, fn: (text: string) => string): T {
  if (typeof value === "string") return fn(value) as T;
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, mapStrings(child, fn)])
    ) as T;
  }
  return value;
}

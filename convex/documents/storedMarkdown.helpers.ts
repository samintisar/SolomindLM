/**
 * The source viewer's copy of a document's extracted text (`documents.extractedMarkdown`). Convex caps a
 * document field near 1 MB of UTF-8, so very large documents keep only a prefix, followed by a note.
 */
export const MAX_STORED_MARKDOWN_CHARS = 800_000;

const TRUNCATION_NOTE =
  "\n\n---\n\n**Note:** Display copy was truncated for a very large document. Use **Original PDF** to view the full file.";

export function toStoredMarkdown(text: string): string {
  return text.length > MAX_STORED_MARKDOWN_CHARS
    ? text.slice(0, MAX_STORED_MARKDOWN_CHARS) + TRUNCATION_NOTE
    : text;
}

/** True when `markdown` is a prefix of the document's text, so text past the cap isn't in it. */
export function isTruncatedStoredMarkdown(markdown: string): boolean {
  return markdown.endsWith(TRUNCATION_NOTE);
}

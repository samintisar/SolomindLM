/**
 * Page labels written by Mistral OCR stitching (`MistralOCRService.markdownFromMistralOcrResponse`):
 * a `**Page N**` line opens each page, and pages after the first are preceded by a `---` line.
 */
export const PAGE_LABEL_LINE = /^\*\*Page (\d+)\*\*[ \t]*\r?$/;

const PAGE_LABEL_LINES = new RegExp(PAGE_LABEL_LINE.source, "gm");

function labelStarts(markdown: string): Array<{ offset: number; page: number }> {
  return Array.from(markdown.matchAll(PAGE_LABEL_LINES), (m) => ({
    offset: m.index ?? 0,
    page: Number(m[1]),
  }));
}

export function hasPageLabels(markdown: string): boolean {
  return labelStarts(markdown).length > 0;
}

/** Highest page label in the text, used as the document's page count. */
export function maxPageLabel(markdown: string): number | null {
  const starts = labelStarts(markdown);
  return starts.length > 0 ? Math.max(...starts.map((s) => s.page)) : null;
}

/** Lookup from a character offset to the page whose label is at or before it (null before the first label). */
export function pageAtOffset(markdown: string): (offset: number) => number | null {
  const starts = labelStarts(markdown);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    let found: number | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid].offset <= offset) {
        found = starts[mid].page;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  };
}

const LEADING_PAGE_BREAK = /^(?:[ \t]*(?:-{3,}|\*\*Page \d+\*\*)[ \t]*\r?\n\s*)+/;

/**
 * Length of the separator and page-label lines that open `chunk`, counted from the start of the
 * *trimmed* chunk (so slice `chunk.trim()` with it). Chunks stored before the chunker
 * read page labels can start on a page break; their page is the page their text starts on, after it.
 */
export function leadingPageBreakLength(chunk: string): number {
  return chunk.trim().match(LEADING_PAGE_BREAK)?.[0].length ?? 0;
}

/**
 * Page that `chunk`'s text (trimmed) sits on in `markdown`: the page its text starts on, after any page break
 * it opens with. When the text occurs more than once, every occurrence must be on the same page; text repeated
 * across pages (captions, headers, image placeholders) can't be placed, so it returns null, as for absent text.
 */
export function chunkPage(
  markdown: string,
  chunk: string,
  lookup: (offset: number) => number | null = pageAtOffset(markdown)
): number | null {
  const needle = chunk.trim();
  if (!needle) return null;
  const textStart = leadingPageBreakLength(chunk);
  let page: number | null = null;
  for (let i = markdown.indexOf(needle); i !== -1; i = markdown.indexOf(needle, i + 1)) {
    const here = lookup(i + textStart);
    if (here === null || (page !== null && here !== page)) return null;
    page = here;
  }
  return page;
}

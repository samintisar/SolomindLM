import { findPassageRange, type TextSegment } from "./passageRange";

/** Name of the CSS highlight styled by `::highlight(source-passage)` in index.css. */
export const PASSAGE_HIGHLIGHT = "source-passage";

function highlightRegistry(): HighlightRegistry | null {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined"
    ? CSS.highlights
    : null;
}

function textSegments(root: Element): TextSegment<Text>[] {
  // KaTeX renders each formula three times (hidden MathML, its TeX source, aria-hidden HTML): skip them all.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(".katex") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const segments: TextSegment<Text>[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    segments.push({ node: node as Text, text: node.textContent ?? "" });
  }
  return segments;
}

/**
 * Scrolls to `quote` inside `root` and paints it with the CSS Custom Highlight API, which marks a Range
 * without touching the DOM React owns. Browsers without the API only scroll. Returns false when the
 * quote isn't found.
 */
export function highlightPassage(root: Element, quote: string): boolean {
  const found = findPassageRange(textSegments(root), quote);
  if (!found) return false;

  const range = document.createRange();
  range.setStart(found.start.node, found.start.offset);
  range.setEnd(found.end.node, found.end.offset);
  highlightRegistry()?.set(PASSAGE_HIGHLIGHT, new Highlight(range));
  found.start.node.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

export function clearPassageHighlight(): void {
  if (typeof CSS !== "undefined" && "highlights" in CSS) CSS.highlights.delete(PASSAGE_HIGHLIGHT);
}

# Citation pages and click-through — design

Part of #356 (cited extraction table), slice 1 of 4. Also delivers growth-plan feature #3, "citations that open the
PDF at the exact page and passage".

## Goal

Every passage from a paginated source knows its page, and clicking a citation opens the source at that passage,
highlighted, with a one-click jump to the same page of the original PDF. Chat citations get this now; extraction-table
cells reuse it in slice 2.

## Problem

- Mistral OCR (PDF, DOCX, PPTX, images) stitches pages as `**Page N**` lines separated by `---`
  (`MistralOCRService.ts` `markdownFromMistralOcrResponse`). `StructuralChunker` only advances its page counter on a
  form feed or `PAGE_BREAK` line, so every chunk is page 1, which it then stores as `null`. The label lines also end up
  inside chunk text.
- `documents.totalPages` is always `null`: `extractDocumentMetadata` is called without a page count.
- A citation click only carries a document id (`SourcesPanelFocusRequest = { documentId, seq }`), so the source opens
  at the top. `PdfViewer` has no initial-page input, and the text view has no highlight.

## Design

### 1. Pages on passages (backend)

- `StructuralChunker.parseIntoSections` recognises a page label line (`/^\*\*Page (\d+)\*\*\s*$/`). On a label it
  closes the current section (dropping a trailing `---` separator line) and opens a new one with the same
  `headingPath`/`level` and `pageNumber = N`. The label line is never added to section content.
- A chunk inherits its section's page, so a chunk never spans two pages and its page is exact.
- `pageNumber` is set only when the document has page labels (or form feeds); unpaginated sources (web, YouTube,
  pasted text) store none. Page 1 is stored as `1`, not dropped.
- `embeddingJob` passes the highest page label as the page count, so `documents.totalPages` is set.
- No schema change: `documentChunks.pageNumber` already exists.

### 2. Backfill existing documents

- `convex/_migration/backfillChunkPages.ts`: an `internalMutation` that pages through `documents` in small batches
  and reschedules itself until done. For each document whose `extractedMarkdown` contains page labels, it reads the
  chunks `by_document` in `chunkIndex` order, finds each chunk's text in the markdown (searching forward from the
  previous match), and patches `pageNumber` from the nearest label at or before the match.
- Chunk text and embeddings are unchanged. A chunk that can't be located keeps `pageNumber` unset.
- The page lookup (`pageAtOffset(markdown) → (offset) → page | null`) is a pure helper that
  lives next to the migration and is unit-tested.
- Run once per deployment: `npx convex run _migration/backfillChunkPages:start`.
- Markdown stored for the UI is capped at 800k chars; chunks past the cap stay unset.

### 3. Click-through (web)

- `ReferenceChunk.metadata` (web type) gains `pageNumber?: number | null`; the server already sends it
  (`_streamSearch.ts`).
- `SourcesPanelFocusRequest` becomes `{ documentId, seq, quote?, pageNumber? }`. `ChatPanel.getOpenReferenceInSources`
  passes the reference's `content` and page; `NotebookView` and `SourcesPanel` thread them to `SourceViewer` as a
  `focus` prop `{ quote, pageNumber, seq }`.
- `SourceViewer` on a new `focus.seq`:
  - switches to the text (Markdown) view, waits for the rendered markdown, then finds the passage and scrolls it into
    view;
  - highlights it with the CSS Custom Highlight API (`CSS.highlights`, a `::highlight(source-passage)` style using a
    semantic token). This paints a `Range` without mutating React's DOM. Without the API it only scrolls;
  - shows a slim bar above the content: "Page 7 · Open PDF" when a page is known and the source has a stored PDF; "Page
    7" alone otherwise; nothing when no page is known. "Open PDF" switches to the Original PDF view at that page.
- `PdfViewer` gains `initialPage?: number`; after the document loads it calls its existing `goToPage(initialPage)`.
- Passage matching is a pure helper, `findPassageRange(textNodes, quote)`:
  - normalises both sides to lowercase word tokens (drops markdown symbols, punctuation, extra whitespace), keeping a
    map from each DOM word back to its text node and offset;
  - anchors on the quote's first 6 words, then its last 6 words after that start; if the end anchor is missing it
    highlights from the start anchor for the quote's word count;
  - returns `null` when the start anchor isn't found, and the viewer opens at the top as today.
- `CitationCard` shows "p. 7" next to the source title when a page is known.

## Error handling

- Every step degrades to today's behaviour: no page → no page bar; no match → open at top; no `CSS.highlights` →
  scroll without highlight; no stored PDF → no "Open PDF".
- The backfill never rewrites chunk text and skips documents without labels, so a rerun is harmless.

## Testing

- TDD, `test:convex`: chunker on a page-labelled document (pages per chunk, no label or `---` lines in chunk text,
  unpaginated input → no pages, page 1 stored as 1); `pageAtOffset`; backfill mutation on seeded docs + chunks
  (convex-test).
- TDD, `test:web`: `findPassageRange` (exact match, markdown symbols and spacing differences, missing end anchor,
  no match).
- Component test: `SourceViewer` shows the page bar and switches to the PDF view at the page.
- Regression: existing chat retrieval tests; `eval:rag --runner chat` to confirm answers are unchanged with
  page-split chunks.
- Manual: in the browser, ask a question on an OCR'd PDF, click a citation, confirm scroll + highlight + "Open PDF" at
  the right page.

## Out of scope

- Highlighting inside the rendered PDF page (its text layer differs from OCR text).
- The extraction table, column templates and XLSX export (slices 2–4 of #356).
- Pages for sources that don't go through Mistral OCR.

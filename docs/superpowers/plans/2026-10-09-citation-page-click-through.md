# Citation pages and click-through Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every passage from an OCR'd source knows its page, and clicking a chat citation opens the source at that passage, highlighted, with "Page N · Open PDF" jumping the original PDF to that page.

**Architecture:** The chunker turns Mistral OCR's `**Page N**` label lines into section breaks, so each chunk carries an exact `pageNumber` (an existing, unused field). A self-scheduling migration backfills pages on existing chunks by locating each chunk's text in the stored markdown. On the web, a citation click carries the passage text and page through `SourcesPanelFocusRequest` to `SourceViewer`, which finds the passage in the rendered markdown with a pure word-matching helper and paints it with the CSS Custom Highlight API; `PdfViewer` gains an `initialPage` prop.

**Tech Stack:** Convex (mutations, scheduler, convex-test), LangChain `RecursiveCharacterTextSplitter`, React 19, react-pdf, Vitest (node + jsdom projects), Testing Library.

**Spec:** [`docs/superpowers/specs/2026-10-09-citation-page-click-through-design.md`](../specs/2026-10-09-citation-page-click-through-design.md)

**Branch:** `feature/citation-page-click-through` (worktree `.claude/worktrees/heuristic-satoshi-f4f14a`). Run every command from the worktree root unless a step says otherwise. Commit only the paths you touched (`git commit -- <paths>`).

---

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `convex/_services/processing/pageLabels.ts` | Create | Page-label regex, `hasPageLabels`, `maxPageLabel`, `pageAtOffset`, `locateChunkOffset` |
| `convex/_services/processing/pageLabels.test.ts` | Create | Unit tests for the above |
| `convex/_services/processing/StructuralChunker.ts` | Modify | Split sections at page labels; exact per-chunk pages |
| `convex/_services/processing/StructuralChunker.test.ts` | Create | Chunker page tests |
| `convex/documents/embeddingJob.ts` | Modify | Pass the page count so `documents.totalPages` is set |
| `convex/_migration/backfillChunkPages.ts` | Create | Self-scheduling backfill of `documentChunks.pageNumber` |
| `convex/_migration/backfillChunkPages.test.ts` | Create | convex-test for the backfill |
| `apps/web/src/shared/types/index.ts` | Modify | `ReferenceChunk.metadata.pageNumber`, new `SourceFocusTarget` |
| `apps/web/src/features/sources/utils/passageRange.ts` | Create | Pure `findPassageRange` word matcher |
| `apps/web/src/features/sources/utils/passageRange.test.ts` | Create | Node tests for the matcher |
| `apps/web/src/features/sources/utils/highlightPassage.ts` | Create | DOM glue: text nodes → Range → `CSS.highlights` + scroll |
| `apps/web/src/features/sources/utils/highlightPassage.test.ts` | Create | jsdom tests |
| `apps/web/src/index.css` | Modify | `::highlight(source-passage)` style |
| `apps/web/src/features/sources/components/PdfViewer.tsx` | Modify | `initialPage` prop |
| `apps/web/src/features/sources/components/PdfViewer.test.tsx` | Modify | Initial-page test |
| `apps/web/src/features/sources/components/SourceViewer.tsx` | Modify | `focus` prop: highlight passage, page bar, Open PDF |
| `apps/web/src/features/sources/components/SourceViewer.test.tsx` | Modify | Focus tests |
| `apps/web/src/features/sources/components/SourcesPanel.tsx` | Modify | Carry quote/page to `SourceViewer` |
| `apps/web/src/features/notebooks/components/views/NotebookView.tsx` | Modify | Build the focus request from a citation |
| `apps/web/src/features/chat/components/ChatPanel.tsx` | Modify | Pass passage + page when opening a source |
| `apps/web/src/features/chat/components/DeepResearchSourcesSection.tsx` | Modify | Widen the `onOpenNotebookSource` prop type |
| `apps/web/src/features/chat/components/CitationCard.tsx` | Modify | Show "p. N" |
| `apps/web/src/features/chat/components/CitationCard.test.tsx` | Modify | Page label test |

---

### Task 1: Page-label helpers

**Files:**
- Create: `convex/_services/processing/pageLabels.ts`
- Test: `convex/_services/processing/pageLabels.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// convex/_services/processing/pageLabels.test.ts
import { describe, expect, it } from "vitest";
import {
  hasPageLabels,
  leadingPageBreakLength,
  locateChunkOffset,
  maxPageLabel,
  PAGE_LABEL_LINE,
  pageAtOffset,
} from "./pageLabels";

const OCR_MARKDOWN = [
  "**Page 1**",
  "",
  "Alpha on page one.",
  "",
  "---",
  "",
  "**Page 2**",
  "",
  "Beta on page two.",
  "",
  "---",
  "",
  "**Page 3**",
  "",
  "Gamma on page three.",
].join("\n");

describe("PAGE_LABEL_LINE", () => {
  it("matches a whole label line and captures the page", () => {
    expect("**Page 12**".match(PAGE_LABEL_LINE)?.[1]).toBe("12");
    expect("**Page 12**  ".match(PAGE_LABEL_LINE)?.[1]).toBe("12");
  });

  it("ignores a label inside a sentence", () => {
    expect("See **Page 12** for details".match(PAGE_LABEL_LINE)).toBeNull();
  });
});

describe("hasPageLabels / maxPageLabel", () => {
  it("finds labels in OCR markdown", () => {
    expect(hasPageLabels(OCR_MARKDOWN)).toBe(true);
    expect(maxPageLabel(OCR_MARKDOWN)).toBe(3);
  });

  it("reports none for unpaginated text", () => {
    expect(hasPageLabels("Plain text.\n\nMore text.")).toBe(false);
    expect(maxPageLabel("Plain text.")).toBeNull();
  });
});

describe("pageAtOffset", () => {
  it("returns the page of the nearest label at or before the offset", () => {
    const lookup = pageAtOffset(OCR_MARKDOWN);
    expect(lookup(OCR_MARKDOWN.indexOf("Alpha"))).toBe(1);
    expect(lookup(OCR_MARKDOWN.indexOf("Beta"))).toBe(2);
    expect(lookup(OCR_MARKDOWN.indexOf("**Page 3**"))).toBe(3);
    expect(lookup(OCR_MARKDOWN.indexOf("Gamma"))).toBe(3);
  });

  it("returns null before the first label and for unpaginated text", () => {
    expect(pageAtOffset("intro\n\n**Page 1**\n\nbody")(0)).toBeNull();
    expect(pageAtOffset("no labels")(3)).toBeNull();
  });
});

describe("leadingPageBreakLength", () => {
  it("measures separator and label lines that open a chunk", () => {
    const chunk = "---\n\n**Page 3**\n\nGamma on page three.";
    expect(chunk.slice(leadingPageBreakLength(chunk))).toBe("Gamma on page three.");
    expect(leadingPageBreakLength("**Page 1**\n\nAlpha")).toBe("**Page 1**\n\n".length);
    expect(leadingPageBreakLength("Plain start")).toBe(0);
  });
});

describe("locateChunkOffset", () => {
  it("finds the chunk text", () => {
    expect(locateChunkOffset(OCR_MARKDOWN, "Beta on page two.", 0)).toBe(
      OCR_MARKDOWN.indexOf("Beta")
    );
  });

  it("picks the occurrence closest to the expected offset", () => {
    const text = "repeat me\n\nmiddle\n\nrepeat me";
    expect(locateChunkOffset(text, "repeat me", text.length)).toBe(text.lastIndexOf("repeat me"));
    expect(locateChunkOffset(text, "repeat me", 0)).toBe(0);
  });

  it("trims the chunk and returns -1 when it is absent or empty", () => {
    expect(locateChunkOffset(OCR_MARKDOWN, "  Gamma on page three.\n", 0)).toBe(
      OCR_MARKDOWN.indexOf("Gamma")
    );
    expect(locateChunkOffset(OCR_MARKDOWN, "not here", 0)).toBe(-1);
    expect(locateChunkOffset(OCR_MARKDOWN, "   ", 0)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test:convex -- convex/_services/processing/pageLabels.test.ts`
Expected: FAIL — `Failed to resolve import "./pageLabels"`.

- [ ] **Step 3: Implement**

```ts
// convex/_services/processing/pageLabels.ts
/**
 * Page labels written by Mistral OCR stitching (`MistralOCRService.markdownFromMistralOcrResponse`):
 * a `**Page N**` line opens each page, and pages after the first are preceded by a `---` line.
 */
export const PAGE_LABEL_LINE = /^\*\*Page (\d+)\*\*[ \t]*$/;

const PAGE_LABEL_LINES = /^\*\*Page (\d+)\*\*[ \t]*$/gm;

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

const LEADING_PAGE_BREAK = /^(?:[ \t]*(?:-{3,}|\*\*Page \d+\*\*)[ \t]*\n\s*)+/;

/**
 * Length of the separator and page-label lines that open `chunk` (trimmed). Chunks stored before the chunker
 * read page labels can start on a page break; their page is the page their text starts on, after it.
 */
export function leadingPageBreakLength(chunk: string): number {
  return chunk.trim().match(LEADING_PAGE_BREAK)?.[0].length ?? 0;
}

/** Offset of `chunk` (trimmed) in `markdown`, choosing the occurrence closest to `expectedOffset`; -1 when absent. */
export function locateChunkOffset(markdown: string, chunk: string, expectedOffset: number): number {
  const needle = chunk.trim();
  if (!needle) return -1;
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = markdown.indexOf(needle); i !== -1; i = markdown.indexOf(needle, i + 1)) {
    const distance = Math.abs(i - expectedOffset);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test:convex -- convex/_services/processing/pageLabels.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/_services/processing/pageLabels.ts convex/_services/processing/pageLabels.test.ts
git commit -m "feat(sources): helpers to read OCR page labels" -- convex/_services/processing/pageLabels.ts convex/_services/processing/pageLabels.test.ts
```

---

### Task 2: Chunker splits sections at page labels

**Files:**
- Modify: `convex/_services/processing/StructuralChunker.ts` (fields near `:56-57`, `chunk()` `:67-110`, `parseIntoSections()` `:115-163`, `extractChunkMetadata()` `pageNumber` line `:205`)
- Test: `convex/_services/processing/StructuralChunker.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// convex/_services/processing/StructuralChunker.test.ts
import { describe, expect, it } from "vitest";
import { StructuralChunker } from "./StructuralChunker";

const OCR_DOC = [
  "**Page 1**",
  "",
  "# Intro",
  "",
  "Alpha text on page one.",
  "",
  "---",
  "",
  "**Page 2**",
  "",
  "Beta text on page two.",
  "",
  "## Methods",
  "",
  "Gamma text on page two.",
  "",
  "---",
  "",
  "**Page 3**",
  "",
  "Delta text on page three.",
].join("\n");

async function chunk(text: string) {
  return new StructuralChunker().chunk(text, 1000, 0);
}

describe("StructuralChunker pages", () => {
  it("gives each chunk the page it sits on, keeping the heading path across pages", async () => {
    const chunks = await chunk(OCR_DOC);
    expect(
      chunks.map((c) => [c.content.trim(), c.metadata.pageNumber, c.metadata.sectionTitle])
    ).toEqual([
      ["Alpha text on page one.", 1, "Intro"],
      ["Beta text on page two.", 2, "Intro"],
      ["Gamma text on page two.", 2, "Methods"],
      ["Delta text on page three.", 3, "Methods"],
    ]);
  });

  it("keeps page labels and page separators out of chunk text", async () => {
    const chunks = await chunk(OCR_DOC);
    for (const c of chunks) {
      expect(c.content).not.toMatch(/\*\*Page \d+\*\*/);
      expect(c.content).not.toMatch(/^-{3,}\s*$/m);
    }
  });

  it("stores no page for unpaginated text", async () => {
    const chunks = await chunk("# Notes\n\nPlain text without pages.");
    expect(chunks.map((c) => c.metadata.pageNumber)).toEqual([null]);
  });

  it("still counts form-feed page breaks", async () => {
    const chunks = await chunk("First page text.\n\x0C\nSecond page text.");
    expect(chunks.map((c) => [c.content.trim(), c.metadata.pageNumber])).toEqual([
      ["First page text.", 1],
      ["Second page text.", 2],
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test:convex -- convex/_services/processing/StructuralChunker.test.ts`
Expected: FAIL — the first test gets pages `[null, null, null, null]` and chunk text containing `**Page 2**`.

- [ ] **Step 3: Implement**

In `StructuralChunker.ts`, add the import under the existing imports:

```ts
import { PAGE_LABEL_LINE } from "./pageLabels";
```

Add a field next to `currentPageNumber`:

```ts
  /** True when the document marks its pages (OCR page labels or form feeds); unpaginated text stores no page. */
  private paginated = false;
```

In `chunk()`, after `this.currentPageNumber = 1;` add:

```ts
    this.paginated = false;
```

Replace the whole `parseIntoSections` method with:

```ts
  /**
   * Parse document into sections based on headings and page breaks.
   * A page break closes the current section and opens one on the new page with the same heading path,
   * so a section (and every chunk cut from it) sits on exactly one page.
   */
  private parseIntoSections(document: string): DocumentSection[] {
    const lines = document.split("\n");
    const sections: DocumentSection[] = [];

    let currentSection: DocumentSection = {
      content: "",
      headingPath: [],
      level: 0,
      pageNumber: 1,
      startOffset: 0,
    };

    const closeSection = (atPageBreak = false) => {
      // OCR writes a `---` line before each page label; it belongs to neither page.
      // Only a trailing one at a page break is dropped, so rules inside a page survive.
      const content = atPageBreak
        ? currentSection.content.replace(/(?:^|\n)-{3,}[ \t]*\n*$/, "\n")
        : currentSection.content;
      if (content.trim()) {
        sections.push({ ...currentSection, content });
      }
    };

    const startPage = (pageNumber: number) => {
      closeSection(true);
      this.paginated = true;
      this.currentPageNumber = pageNumber;
      currentSection = {
        content: "",
        headingPath: currentSection.headingPath,
        level: currentSection.level,
        pageNumber,
        startOffset: 0,
      };
    };

    for (const line of lines) {
      const pageLabel = line.match(PAGE_LABEL_LINE);
      if (pageLabel) {
        startPage(Number(pageLabel[1]));
        continue;
      }

      if (line.includes("\x0C") || line.includes("PAGE_BREAK")) {
        // Form feed or explicit page break marker
        startPage(this.currentPageNumber + 1);
        continue;
      }

      // Detect markdown headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        closeSection();

        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();

        // Update heading stack
        this.updateHeadingStack(level, title);

        // Start new section
        currentSection = {
          content: "",
          headingPath: this.headingStack.map((h) => h.title),
          level,
          pageNumber: this.currentPageNumber,
          startOffset: 0, // Track approximate position if needed
        };
      } else {
        currentSection.content += line + "\n";
      }
    }

    // Don't forget the last section
    closeSection();

    return sections;
  }
```

The separator regex has no `m` flag, so `$` is the end of the section text: it strips only a final `---` line and the blank lines after it. Check: `"\nAlpha text on page one.\n\n---\n\n"` becomes `"\nAlpha text on page one.\n\n"`, while `"a\n\n---\n\nb\n"` (a rule inside a page) is unchanged.

Add this case to the test file's `describe` block to pin it:

```ts
  it("keeps a horizontal rule that sits inside a page", async () => {
    const chunks = await chunk("**Page 1**\n\nAbove the rule.\n\n---\n\nBelow the rule.");
    expect(chunks.map((c) => c.content)).toEqual([expect.stringMatching(/Above the rule\.\n\n---\n\nBelow the rule\./)]);
  });
```

In `extractChunkMetadata`, replace

```ts
      pageNumber: section.pageNumber > 1 ? section.pageNumber : null,
```

with

```ts
      pageNumber: this.paginated ? section.pageNumber : null,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test:convex -- convex/_services/processing/StructuralChunker.test.ts convex/_services/processing/pageLabels.test.ts`
Expected: PASS (5 + 10 tests).

If the separator test fails because a `---` survives, print `JSON.stringify(currentSection.content)` inside `closeSection` for the failing case and adjust only the separator regex; do not change the label handling.

- [ ] **Step 5: Run the whole Convex suite for regressions**

Run: `bun run test:convex`
Expected: PASS (all ~1,800 tests). Chunk-count snapshots, if any fail, must be inspected: a document with page labels now yields extra chunks at page edges, which is intended.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(sources): give every OCR chunk the page it sits on" -- convex/_services/processing/StructuralChunker.ts convex/_services/processing/StructuralChunker.test.ts
```

(Stage the new test file first: `git add convex/_services/processing/StructuralChunker.test.ts`.)

---

### Task 3: Set `documents.totalPages`

**Files:**
- Modify: `convex/documents/embeddingJob.ts:336`

- [ ] **Step 1: Pass the page count**

Add to the imports at the top of `convex/documents/embeddingJob.ts`:

```ts
import { maxPageLabel } from "../_services/processing/pageLabels";
```

Replace line 336:

```ts
      const docMetadata = extractDocumentMetadata(extractedText, fileExtension);
```

with:

```ts
      const docMetadata = extractDocumentMetadata(
        extractedText,
        fileExtension,
        maxPageLabel(extractedText) ?? undefined
      );
```

`extractDocumentMetadata(parsedContent, fileExtension?, pageCount?)` already returns `totalPages: pageCount ?? null`, and line ~408 already writes `totalPages: docMetadata.totalPages ?? undefined`.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck:convex`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(sources): record the page count of OCR'd documents" -- convex/documents/embeddingJob.ts
```

---

### Task 4: Backfill pages on existing chunks

**Files:**
- Create: `convex/_migration/backfillChunkPages.ts`
- Test: `convex/_migration/backfillChunkPages.test.ts`

Convex allows one paginated query per function, so documents and chunks are walked by two mutations that schedule each other: `scanDocuments` reads one document per call; when it has page labels, `backfillDocumentChunks` patches its chunks 200 at a time (each chunk row carries a 1536-float embedding, ~13 KB, so 200 rows stay well under the per-function read limit), then hands the document cursor back to `scanDocuments`.

- [ ] **Step 1: Write the failing test**

```ts
// convex/_migration/backfillChunkPages.test.ts
/// <reference types="vite/client" />

import { defineSchema } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

// Seed only the fields the backfill reads.
const looseSchema = defineSchema(schema.tables, { schemaValidation: false });

const PAGED = [
  "**Page 1**",
  "",
  "Alpha on page one.",
  "",
  "---",
  "",
  "**Page 2**",
  "",
  "Beta on page two.",
  "",
  "---",
  "",
  "**Page 3**",
  "",
  "Gamma on page three.",
].join("\n");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("backfillChunkPages", () => {
  test("sets each chunk's page from the OCR labels and leaves other documents alone", async () => {
    const t = convexTest(looseSchema, modules);

    const ids = await t.run(async (ctx) => {
      const insertDoc = (extractedMarkdown: string | undefined) =>
        ctx.db.insert("documents", { extractedMarkdown } as never) as Promise<Id<"documents">>;
      const insertChunk = (documentId: Id<"documents">, chunkIndex: number, content: string, relativePosition: number) =>
        ctx.db.insert("documentChunks", { documentId, chunkIndex, content, relativePosition } as never);

      const paged = await insertDoc(PAGED);
      const plain = await insertDoc("No labels here.");
      const empty = await insertDoc(undefined);
      return {
        alpha: await insertChunk(paged, 0, "**Page 1**\n\nAlpha on page one.", 0),
        beta: await insertChunk(paged, 1, "Beta on page two.", 0.5),
        gamma: await insertChunk(paged, 2, "---\n\n**Page 3**\n\nGamma on page three.", 1),
        missing: await insertChunk(paged, 3, "Text that is not in the markdown.", 1),
        plain: await insertChunk(plain, 0, "No labels here.", 0),
        empty: await insertChunk(empty, 0, "Anything.", 0),
      };
    });

    await t.mutation(internal._migration.backfillChunkPages.start, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const pages = await t.run(async (ctx) => {
      const pageOf = async (id: (typeof ids)[keyof typeof ids]) => (await ctx.db.get(id))?.pageNumber;
      return {
        alpha: await pageOf(ids.alpha),
        beta: await pageOf(ids.beta),
        gamma: await pageOf(ids.gamma),
        missing: await pageOf(ids.missing),
        plain: await pageOf(ids.plain),
        empty: await pageOf(ids.empty),
      };
    });

    expect(pages).toEqual({
      alpha: 1,
      beta: 2,
      // An old chunk that opens on the separator and label belongs to the page its text starts on.
      gamma: 3,
      missing: undefined,
      plain: undefined,
      empty: undefined,
    });
  });

  test("walks a document's chunks across several batches", async () => {
    const t = convexTest(looseSchema, modules);
    const chunkCount = 450; // > 2 batches of 200
    const docId = await t.run(async (ctx) => {
      const documentId = (await ctx.db.insert("documents", {
        extractedMarkdown: PAGED,
      } as never)) as Id<"documents">;
      for (let i = 0; i < chunkCount; i++) {
        await ctx.db.insert("documentChunks", {
          documentId,
          chunkIndex: i,
          content: "Gamma on page three.",
          relativePosition: 1,
        } as never);
      }
      return documentId;
    });

    await t.mutation(internal._migration.backfillChunkPages.start, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const unset = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("documentChunks")
          .withIndex("by_document", (q) => q.eq("documentId", docId))
          .collect()
      ).filter((c) => c.pageNumber !== 3).length
    );
    expect(unset).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:convex -- convex/_migration/backfillChunkPages.test.ts`
Expected: FAIL — `internal._migration.backfillChunkPages` is undefined (module missing).

- [ ] **Step 3: Implement**

```ts
// convex/_migration/backfillChunkPages.ts
/**
 * Migration: set `documentChunks.pageNumber` on chunks stored before the chunker read OCR page labels.
 *
 * For each document whose `extractedMarkdown` has `**Page N**` labels, every chunk's text is found in the
 * markdown and given the page of the nearest label at or before it. Chunk text and embeddings are untouched;
 * a chunk that can't be found keeps no page. Safe to rerun.
 *
 *   npx convex run _migration/backfillChunkPages:start
 *
 * Convex allows one paginated query per function, so documents and chunks are walked by two mutations
 * that schedule each other.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import {
  hasPageLabels,
  leadingPageBreakLength,
  locateChunkOffset,
  pageAtOffset,
} from "../_services/processing/pageLabels";

/** Chunk rows carry a 1536-float embedding (~13 KB), so 200 rows stay far below the per-function read limit. */
const CHUNK_BATCH_SIZE = 200;

export const start = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal._migration.backfillChunkPages.scanDocuments, {
      cursor: null,
    });
  },
});

/** Reads one document (stored markdown can be ~800 KB) and hands paginated ones to the chunk pass. */
export const scanDocuments = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db.query("documents").paginate({ cursor, numItems: 1 });
    const nextCursor = result.isDone ? null : result.continueCursor;
    const doc = result.page[0];

    if (doc?.extractedMarkdown && hasPageLabels(doc.extractedMarkdown)) {
      await ctx.scheduler.runAfter(
        0,
        internal._migration.backfillChunkPages.backfillDocumentChunks,
        { documentId: doc._id, chunkCursor: null, documentCursor: nextCursor }
      );
      return;
    }
    if (nextCursor !== null) {
      await ctx.scheduler.runAfter(0, internal._migration.backfillChunkPages.scanDocuments, {
        cursor: nextCursor,
      });
    }
  },
});

export const backfillDocumentChunks = internalMutation({
  args: {
    documentId: v.id("documents"),
    chunkCursor: v.union(v.string(), v.null()),
    /** Where `scanDocuments` resumes once this document is done; null when it was the last one. */
    documentCursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { documentId, chunkCursor, documentCursor }) => {
    const markdown = (await ctx.db.get(documentId))?.extractedMarkdown;
    if (markdown) {
      const lookup = pageAtOffset(markdown);
      const result = await ctx.db
        .query("documentChunks")
        .withIndex("by_document", (q) => q.eq("documentId", documentId))
        .paginate({ cursor: chunkCursor, numItems: CHUNK_BATCH_SIZE });

      for (const chunk of result.page) {
        const expected = Math.round((chunk.relativePosition ?? 0) * markdown.length);
        const offset = locateChunkOffset(markdown, chunk.content, expected);
        if (offset < 0) continue;
        // Old chunks can open on a page break; use the page their text starts on.
        const pageNumber = lookup(offset + leadingPageBreakLength(chunk.content));
        if (pageNumber !== null && chunk.pageNumber !== pageNumber) {
          await ctx.db.patch(chunk._id, { pageNumber });
        }
      }

      if (!result.isDone) {
        await ctx.scheduler.runAfter(
          0,
          internal._migration.backfillChunkPages.backfillDocumentChunks,
          { documentId, chunkCursor: result.continueCursor, documentCursor }
        );
        return;
      }
    }

    if (documentCursor !== null) {
      await ctx.scheduler.runAfter(0, internal._migration.backfillChunkPages.scanDocuments, {
        cursor: documentCursor,
      });
    }
  },
});
```

- [ ] **Step 4: Regenerate the Convex API types**

Run: `npx convex codegen`
Expected: `convex/_generated/api.d.ts` now lists `_migration/backfillChunkPages`. (CI fails on stale generated files; Knip with it.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run test:convex -- convex/_migration/backfillChunkPages.test.ts`
Expected: PASS (2 tests).

If the 450-chunk test is slow (> 20 s), lower `chunkCount` to 401 — it only needs to cross two batch boundaries.

- [ ] **Step 6: Commit**

```bash
git add convex/_migration/backfillChunkPages.ts convex/_migration/backfillChunkPages.test.ts
git commit -m "feat(sources): backfill pages on existing OCR chunks" -- convex/_migration/backfillChunkPages.ts convex/_migration/backfillChunkPages.test.ts convex/_generated
```

---

### Task 5: Web types and the passage matcher

**Files:**
- Modify: `apps/web/src/shared/types/index.ts:52-64`
- Create: `apps/web/src/features/sources/utils/passageRange.ts`
- Test: `apps/web/src/features/sources/utils/passageRange.test.ts`

- [ ] **Step 1: Extend the shared types**

In `apps/web/src/shared/types/index.ts`, change the `metadata` line of `ReferenceChunk` to:

```ts
  /** Retrieval metadata. The previews are the neighbouring passages' edges the answer also saw. */
  metadata?: {
    previousChunkPreview?: string | null;
    nextChunkPreview?: string | null;
    /** Page the passage sits on, for sources with pages (OCR'd PDF, DOCX, PPTX). */
    pageNumber?: number | null;
  };
```

and add right after the `ReferenceChunk` interface:

```ts
/** Where to land when a source is opened from a citation: the cited passage and its page. */
export interface SourceFocusTarget {
  quote?: string;
  pageNumber?: number | null;
}
```

- [ ] **Step 2: Write the failing matcher tests**

```ts
// apps/web/src/features/sources/utils/passageRange.test.ts
import { describe, expect, it } from "vitest";
import { findPassageRange } from "./passageRange";

describe("findPassageRange", () => {
  it("finds an exact passage inside one text run", () => {
    const text = "Intro. The model retrieves passages before it answers.";
    expect(
      findPassageRange([{ node: "a", text }], "The model retrieves passages before it answers.")
    ).toEqual({
      start: { node: "a", offset: text.indexOf("The") },
      end: { node: "a", offset: text.indexOf("answers") + "answers".length },
    });
  });

  it("ignores markdown symbols, link targets, case and spacing, across text runs", () => {
    const segments = [
      { node: "p1", text: "Before. The " },
      { node: "strong", text: "model" },
      { node: "p2", text: " retrieves passages\nbefore it answers." },
    ];
    const quote = "the **Model** retrieves   passages before it [answers](https://example.org).";
    expect(findPassageRange(segments, quote)).toEqual({
      start: { node: "p1", offset: "Before. ".length },
      end: { node: "p2", offset: " retrieves passages\nbefore it answers".length },
    });
  });

  it("highlights the quote's length from the start when its ending isn't on the page", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta";
    const quote = "alpha beta gamma delta epsilon zeta missing words here now ok fine";
    expect(findPassageRange([{ node: "a", text }], quote)).toEqual({
      start: { node: "a", offset: 0 },
      end: { node: "a", offset: text.length },
    });
  });

  it("anchors on a later window when the opening words render differently", () => {
    const text = "Proof sketch. alpha beta gamma delta epsilon zeta follows.";
    const quote = "λ-term zzz yyy xxx www alpha beta gamma delta epsilon zeta";
    expect(findPassageRange([{ node: "a", text }], quote)).toEqual({
      start: { node: "a", offset: text.indexOf("alpha") },
      end: { node: "a", offset: text.indexOf("zeta") + "zeta".length },
    });
  });

  it("returns null when the passage isn't there", () => {
    expect(findPassageRange([{ node: "a", text: "Nothing related." }], "Totally different words")).toBeNull();
    expect(findPassageRange([], "anything")).toBeNull();
    expect(findPassageRange([{ node: "a", text: "Some text" }], "  ** ")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test -- src/features/sources/utils/passageRange.test.ts`
Expected: FAIL — `Failed to resolve import "./passageRange"`.

- [ ] **Step 4: Implement**

```ts
// apps/web/src/features/sources/utils/passageRange.ts
/** A run of rendered text and the handle (a DOM Text node in the app) it came from. */
export interface TextSegment<N> {
  node: N;
  text: string;
}

export interface PassagePoint<N> {
  node: N;
  offset: number;
}

export interface PassageRange<N> {
  start: PassagePoint<N>;
  end: PassagePoint<N>;
}

interface Word<N> {
  word: string;
  node: N;
  start: number;
  end: number;
}

const WORD = /[\p{L}\p{N}]+/gu;
/** Words matched at each end of the quote. Long enough to be unique in a page, short enough to dodge formatting. */
const ANCHOR_WORDS = 6;

function wordsOf<N>(segments: readonly TextSegment<N>[]): Word<N>[] {
  const words: Word<N>[] = [];
  for (const { node, text } of segments) {
    for (const m of text.matchAll(WORD)) {
      const start = m.index ?? 0;
      words.push({ word: m[0].toLowerCase(), node, start, end: start + m[0].length });
    }
  }
  return words;
}

/** The quote's words as a reader sees them: link targets and HTML tags dropped. */
function quoteWords(quote: string): string[] {
  const visible = quote.replace(/\]\([^)]*\)/g, "]").replace(/<[^>]+>/g, " ");
  return Array.from(visible.matchAll(WORD), (m) => m[0].toLowerCase());
}

function indexOfRun<N>(words: Word<N>[], run: string[], from: number, until: number): number {
  const last = Math.min(words.length, until) - run.length;
  outer: for (let i = from; i <= last; i++) {
    for (let j = 0; j < run.length; j++) {
      if (words[i + j].word !== run[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Locates `quote` (raw markdown from a chunk) in rendered text. Anchors on a window of the quote's words —
 * the opening six, then each next six, then the closing six, since a quote can open with maths or a link that
 * renders differently — and ends on the quote's last six words. When the ending can't be found it covers the
 * quote's word count from the start. Returns null when no window is found.
 */
export function findPassageRange<N>(
  segments: readonly TextSegment<N>[],
  quote: string
): PassageRange<N> | null {
  const words = wordsOf(segments);
  const q = quoteWords(quote);
  if (q.length === 0 || words.length === 0) return null;

  const k = Math.min(ANCHOR_WORDS, q.length);
  const windowOffsets: number[] = [];
  for (let offset = 0; offset + k <= q.length; offset += k) windowOffsets.push(offset);
  if (windowOffsets[windowOffsets.length - 1] !== q.length - k) windowOffsets.push(q.length - k);

  let startIdx = -1;
  let skipped = 0;
  for (const offset of windowOffsets) {
    startIdx = indexOfRun(words, q.slice(offset, offset + k), 0, words.length);
    if (startIdx !== -1) {
      skipped = offset;
      break;
    }
  }
  if (startIdx === -1) return null;

  const remaining = q.length - skipped;
  const endRun = indexOfRun(words, q.slice(q.length - k), startIdx, startIdx + remaining * 2 + k);
  const endIdx =
    endRun !== -1 ? endRun + k - 1 : Math.min(startIdx + remaining - 1, words.length - 1);

  const first = words[startIdx];
  const last = words[endIdx];
  return {
    start: { node: first.node, offset: first.start },
    end: { node: last.node, offset: last.end },
  };
}
```

How the tests exercise it:
- Test 3: 12 quote words; window 0 matches at `alpha`; the end window `missing words here now ok fine` is absent, so `endIdx = min(0 + 12 - 1, 7) = 7` → the end of `theta`.
- Test 4: `λ-term` splits into `λ`, `term`, so the quote has 12 words. Window 0 (`λ term zzz yyy xxx www`) is absent; window 6 (`alpha … zeta`) matches. `remaining = 6`, and the end window is the same run, so the range ends at `zeta`.
- The extra closing window matters only when the quote's length isn't a multiple of 6 (e.g. 11 words → windows at 0 and 5).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test -- src/features/sources/utils/passageRange.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/sources/utils/passageRange.ts apps/web/src/features/sources/utils/passageRange.test.ts
git commit -m "feat(sources): find a cited passage in rendered source text" -- apps/web/src/shared/types/index.ts apps/web/src/features/sources/utils/passageRange.ts apps/web/src/features/sources/utils/passageRange.test.ts
```

---

### Task 6: Highlight a passage in the DOM

**Files:**
- Create: `apps/web/src/features/sources/utils/highlightPassage.ts`
- Test: `apps/web/src/features/sources/utils/highlightPassage.test.ts`
- Modify: `apps/web/src/index.css` (inside the existing `@layer base { … }` at line 9)

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/features/sources/utils/highlightPassage.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPassageHighlight, highlightPassage, PASSAGE_HIGHLIGHT } from "./highlightPassage";

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("highlightPassage", () => {
  it("paints the passage with the CSS highlight registry and scrolls to it", () => {
    const registry = new Map<string, unknown>();
    vi.stubGlobal("CSS", { highlights: registry });
    vi.stubGlobal(
      "Highlight",
      class {
        ranges: Range[];
        constructor(...ranges: Range[]) {
          this.ranges = ranges;
        }
      }
    );
    const root = mount("<p>Intro.</p><p>The <strong>model</strong> retrieves passages.</p>");
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");

    expect(highlightPassage(root, "The **model** retrieves passages.")).toBe(true);

    const highlight = registry.get(PASSAGE_HIGHLIGHT) as { ranges: Range[] };
    expect(highlight.ranges[0].toString()).toBe("The model retrieves passages");
    expect(scroll).toHaveBeenCalled();

    clearPassageHighlight();
    expect(registry.has(PASSAGE_HIGHLIGHT)).toBe(false);
  });

  it("still scrolls when the browser has no highlight registry", () => {
    vi.stubGlobal("CSS", {});
    const root = mount("<p>Alpha beta gamma.</p>");
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");

    expect(highlightPassage(root, "alpha beta gamma")).toBe(true);
    expect(scroll).toHaveBeenCalled();
    expect(() => clearPassageHighlight()).not.toThrow();
  });

  it("returns false when the passage isn't rendered", () => {
    const root = mount("<p>Something else.</p>");
    expect(highlightPassage(root, "not here at all")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test -- src/features/sources/utils/highlightPassage.test.ts`
Expected: FAIL — `Failed to resolve import "./highlightPassage"`.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/features/sources/utils/highlightPassage.ts
import { findPassageRange, type TextSegment } from "./passageRange";

/** Name of the CSS highlight styled by `::highlight(source-passage)` in index.css. */
export const PASSAGE_HIGHLIGHT = "source-passage";

function highlightRegistry(): HighlightRegistry | null {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined"
    ? CSS.highlights
    : null;
}

function textSegments(root: Element): TextSegment<Text>[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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
```

Add inside `@layer base { … }` in `apps/web/src/index.css`:

```css
  /* Cited passage opened from a citation (sources/utils/highlightPassage.ts). */
  ::highlight(source-passage) {
    background-color: var(--warning-muted);
    color: inherit;
  }
```

(`--warning-muted` is defined for light and dark themes at `index.css:45`, `:177`, `:298`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test -- src/features/sources/utils/highlightPassage.test.ts`
Expected: PASS (3 tests). If `range.toString()` includes trailing punctuation, the matcher's end offset is wrong — fix `passageRange.ts`, not the test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/sources/utils/highlightPassage.ts apps/web/src/features/sources/utils/highlightPassage.test.ts
git commit -m "feat(sources): highlight a cited passage without touching React's DOM" -- apps/web/src/features/sources/utils/highlightPassage.ts apps/web/src/features/sources/utils/highlightPassage.test.ts apps/web/src/index.css
```

---

### Task 7: `PdfViewer` opens at a page

**Files:**
- Modify: `apps/web/src/features/sources/components/PdfViewer.tsx` (props `:83-89`; effect after `goToPage` `:267-282`)
- Test: `apps/web/src/features/sources/components/PdfViewer.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `PdfViewer.test.tsx`:

```tsx
describe("PdfViewer initial page", () => {
  test("scrolls to initialPage once the document loads", async () => {
    const scrolled: Element[] = [];
    const scroll = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(function (this: Element) {
        scrolled.push(this);
      });

    render(<PdfViewer file="blob:test.pdf" initialPage={3} />);

    await vi.waitFor(() => expect(scrolled.map((el) => el.getAttribute("data-page"))).toContain("3"));
    scroll.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/web test -- src/features/sources/components/PdfViewer.test.tsx`
Expected: FAIL — TS/JSX error or timeout: `initialPage` is not a prop and nothing scrolls.

- [ ] **Step 3: Implement**

Change the props interface:

```tsx
interface PdfViewerProps {
  /** URL of the PDF (signed URL from Convex storage or blob URL) */
  file: string;
  className?: string;
  /** Page to show once the document loads, e.g. the page a citation points at. */
  initialPage?: number;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ file, className = "", initialPage }) => {
```

Directly after the `goToPage` `useCallback` block, add:

```tsx
  /** Last `initialPage` jumped to, so a re-render doesn't pull the reader back after they scroll. */
  const jumpedToPageRef = useRef<number | null>(null);

  useEffect(() => {
    if (!initialPage || numPages < 1 || jumpedToPageRef.current === initialPage) return;
    jumpedToPageRef.current = initialPage;
    goToPage(initialPage);
  }, [initialPage, numPages, goToPage]);
```

(Page slot refs are set during the commit that renders `numPages` slots, before this effect runs, so `goToPage` finds the element.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test -- src/features/sources/components/PdfViewer.test.tsx`
Expected: PASS (existing tests + the new one).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sources): open the PDF viewer at a given page" -- apps/web/src/features/sources/components/PdfViewer.tsx apps/web/src/features/sources/components/PdfViewer.test.tsx
```

---

### Task 8: `SourceViewer` lands on the cited passage

**Files:**
- Modify: `apps/web/src/features/sources/components/SourceViewer.tsx`
- Test: `apps/web/src/features/sources/components/SourceViewer.test.tsx`

- [ ] **Step 1: Update the test mocks and write the failing tests**

In `SourceViewer.test.tsx`, replace the `PdfViewer` mock with one that exposes `initialPage`:

```tsx
vi.mock("./PdfViewer", () => ({
  PdfViewer: ({ file, initialPage }: { file: string; initialPage?: number }) => (
    <div data-testid="pdf-viewer" data-initial-page={initialPage ?? ""}>
      {file}
    </div>
  ),
}));
```

Add a mock for the highlighter next to the other mocks:

```tsx
vi.mock("../utils/highlightPassage", () => ({
  highlightPassage: vi.fn(() => true),
  clearPassageHighlight: vi.fn(),
}));
```

and import it after the existing mocked imports:

```tsx
import { highlightPassage } from "../utils/highlightPassage";
```

Append:

```tsx
describe("SourceViewer citation focus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useGenerateSourceGuide as ReturnType<typeof vi.fn>).mockReturnValue(
      vi.fn().mockResolvedValue(undefined)
    );
    (useGetSignedUrl as ReturnType<typeof vi.fn>).mockReturnValue(
      vi.fn().mockResolvedValue("blob:pdf")
    );
  });

  const guided = {
    id: "doc1",
    title: "Test Source",
    type: "PDF" as const,
    date: "2024-01-15",
    selected: true,
    status: "completed" as const,
    sourceGuide: { summary: "s", keyTopics: [] },
  };

  test("highlights the cited passage in the text view", async () => {
    renderViewer({ source: guided, focus: { seq: 1, quote: "Test content", pageNumber: 7 } });

    await waitFor(() =>
      expect(highlightPassage).toHaveBeenCalledWith(expect.any(HTMLElement), "Test content")
    );
  });

  test("shows the cited page and opens the PDF there", async () => {
    const user = userEvent.setup();
    renderViewer({
      source: guided,
      pdfStorageId: "storage1",
      focus: { seq: 1, quote: "Test content", pageNumber: 7 },
    });

    expect(screen.getByText("Page 7")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open PDF" }));

    expect(await screen.findByTestId("pdf-viewer")).toHaveAttribute("data-initial-page", "7");
  });

  test("shows the page without Open PDF when there is no stored PDF", () => {
    renderViewer({ source: guided, focus: { seq: 1, quote: "Test content", pageNumber: 7 } });

    expect(screen.getByText("Page 7")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open PDF" })).not.toBeInTheDocument();
  });

  test("shows no page bar when the citation has no page", () => {
    renderViewer({ source: guided, focus: { seq: 1, quote: "Test content" } });

    expect(screen.queryByText(/^Page \d+$/)).not.toBeInTheDocument();
  });
});
```

Before running, open the existing tests in this file to confirm the `sourceGuide` shape they use (search for `sourceGuide:`) and copy it into `guided` if it differs from `{ summary, keyTopics }`; the point of `guided` is only to stop the auto-generate effect.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test -- src/features/sources/components/SourceViewer.test.tsx`
Expected: FAIL — `focus` is not a prop; "Page 7" not found.

- [ ] **Step 3: Implement**

In `SourceViewer.tsx`:

Imports — change the types import and add the highlighter:

```tsx
import type { Source, SourceFocusTarget } from "@/shared/types";
```

(replacing `import { Source } from "@/shared/types";`), and

```tsx
import { clearPassageHighlight, highlightPassage } from "../utils/highlightPassage";
```

Above `interface SourceViewerProps`, add:

```tsx
/** A citation click to land on; `seq` changes on every click so the same passage can be re-opened. */
export type SourceFocus = SourceFocusTarget & { seq: number };

/** The markdown renders lazily, so look for the passage a few times before giving up (about 2 s). */
const PASSAGE_FIND_TRIES = 20;
const PASSAGE_FIND_INTERVAL_MS = 100;
```

Add to `SourceViewerProps`:

```tsx
  /** Cited passage to scroll to and highlight, with its page. */
  focus?: SourceFocus | null;
```

and destructure `focus` in the component parameters.

Next to the other `useState` calls, add:

```tsx
  const [pdfPage, setPdfPage] = useState<number | undefined>(undefined);
  const contentRef = useRef<HTMLDivElement>(null);
  const focusSeq = focus?.seq;
  const focusQuote = focus?.quote;
  const focusPage = focus?.pageNumber ?? null;
```

After the `sanitizedContent` `useMemo` (line ~154), add:

```tsx
  // A new citation click: show the text view, where the passage can be found and highlighted.
  useEffect(() => {
    if (focusSeq === undefined) return;
    setViewMode("markdown");
    setPdfPage(undefined);
  }, [focusSeq]);

  // Find and highlight the cited passage once the markdown has rendered.
  useEffect(() => {
    if (focusSeq === undefined || !focusQuote || viewMode !== "markdown" || isLoading) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      const root = contentRef.current;
      if (root?.textContent?.trim() && highlightPassage(root, focusQuote)) return;
      tries += 1;
      if (tries < PASSAGE_FIND_TRIES) timer = setTimeout(attempt, PASSAGE_FIND_INTERVAL_MS);
    };
    timer = setTimeout(attempt, 0);
    return () => clearTimeout(timer);
  }, [focusSeq, focusQuote, viewMode, isLoading, sanitizedContent]);

  // Drop the highlight when another source opens or the viewer closes.
  useEffect(() => clearPassageHighlight, [source.id]);
```

(`setTimeout`, not `requestAnimationFrame`: a hidden pane pauses animation frames.)

Render the page bar directly above the `{/* PDF / Markdown view toggle … */}` block:

```tsx
      {focusPage !== null && !isLoading && !error && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted px-3 py-1.5 text-sm text-muted-foreground">
          <span>Page {focusPage}</span>
          {canShowPdf && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setViewMode("pdf");
                setPdfPage(focusPage);
              }}
            >
              <FileText aria-hidden />
              Open PDF
            </Button>
          )}
        </div>
      )}
```

Pass the page to the PDF viewer:

```tsx
              <PdfViewer file={pdfUrl} initialPage={pdfPage} />
```

Attach the ref to the markdown container:

```tsx
            <div
              ref={contentRef}
              className="prose max-w-none font-serif leading-relaxed text-foreground/90 select-text"
            >
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test -- src/features/sources/components/SourceViewer.test.tsx`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Design lint**

Run: `bun run lint:design`
Expected: no new violations. If the ratchet flags the page-bar classes, swap to the closest existing pattern in `SourceViewer.tsx` (e.g. the source-guide card's classes) rather than adding an allowance.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(sources): open a source at the cited passage and page" -- apps/web/src/features/sources/components/SourceViewer.tsx apps/web/src/features/sources/components/SourceViewer.test.tsx
```

---

### Task 9: Wire citations to the viewer and show the page on the card

**Files:**
- Modify: `apps/web/src/features/sources/components/SourcesPanel.tsx:24, :143-153, :358-367`
- Modify: `apps/web/src/features/notebooks/components/views/NotebookView.tsx:256-266`
- Modify: `apps/web/src/features/chat/components/ChatPanel.tsx:96, :415-424`
- Modify: `apps/web/src/features/chat/components/DeepResearchSourcesSection.tsx:51`
- Modify: `apps/web/src/features/chat/components/CitationCard.tsx`
- Test: `apps/web/src/features/chat/components/CitationCard.test.tsx`

- [ ] **Step 1: Write the failing CitationCard test**

Append inside the `describe("CitationCard", …)` block:

```tsx
  test("shows the page the passage sits on", async () => {
    render(<CitationCard refId={20} reference={reference({ pageNumber: 7 })} />);

    expect(await screen.findByText(/Reference 20 • p\. 7/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/web test -- src/features/chat/components/CitationCard.test.tsx`
Expected: FAIL — text "Reference 20 • p. 7" not found.

- [ ] **Step 3: Show the page on the card**

In `CitationCard.tsx`, after the `nextPreview` line add:

```tsx
  const pageNumber = reference.metadata?.pageNumber;
```

and change the header paragraph content to:

```tsx
            Reference {refId}
            {pageNumber ? ` • p. ${pageNumber}` : ""}
            {sourceHost ? ` • ${sourceHost}` : ""}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run --cwd apps/web test -- src/features/chat/components/CitationCard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Thread the focus through the panels**

`SourcesPanel.tsx` — replace the type on line 24:

```tsx
export type SourcesPanelFocusRequest = SourceFocusTarget & { documentId: string; seq: number };
```

adding `SourceFocusTarget` to the file's `@/shared/types` import (or adding `import type { SourceFocusTarget } from "@/shared/types";`), and `import { type SourceFocus, SourceViewer } from "./SourceViewer";` in place of the plain `SourceViewer` import.

Next to `viewingSourceId` state, add:

```tsx
  /** The last citation focus, tied to the source it was for so it doesn't follow the reader to other sources. */
  const [viewerFocus, setViewerFocus] = useState<(SourceFocus & { documentId: string }) | null>(
    null
  );
```

Replace the focus effect (`:143-153`) with:

```tsx
  useEffect(() => {
    if (!focusSourceRequest) return;
    if (sources.length === 0) return;
    const { documentId, seq, quote, pageNumber } = focusSourceRequest;
    const exists = sources.some((s) => s.id === documentId);
    if (exists) {
      setViewingSourceId(documentId);
      setViewerFocus({ documentId, seq, quote, pageNumber });
    }
    onFocusSourceHandled?.();
  }, [focusSourceRequest, sources, onFocusSourceHandled]);
```

Pass it to the viewer (inside the `<SourceViewer … />` props at `:358-367`):

```tsx
              focus={viewerFocus?.documentId === viewingSourceId ? viewerFocus : null}
```

`NotebookView.tsx` — replace `handleOpenNotebookSourceFromChat` (`:256-266`) with:

```tsx
  const handleOpenNotebookSourceFromChat = useCallback(
    (documentId: string, focus?: SourceFocusTarget) => {
      setIsSourcesOpen(true);
      setMobileActiveTab("sources");
      setSourceFocusRequest((prev) => ({
        documentId,
        seq: (prev?.seq ?? 0) + 1,
        quote: focus?.quote,
        pageNumber: focus?.pageNumber,
      }));
    },
    []
  );
```

and add `SourceFocusTarget` to its `@/shared/types` import (or `import type { SourceFocusTarget } from "@/shared/types";`).

`ChatPanel.tsx` — change the prop type on line 96:

```tsx
  onOpenNotebookSource?: (documentId: string, focus?: SourceFocusTarget) => void;
```

(import `SourceFocusTarget` from `@/shared/types/index` alongside `ReferenceChunk`), and the opener (`:415-424`):

```tsx
  const getOpenReferenceInSources = useCallback(
    (reference: ReferenceChunk) => {
      const docId = reference.documentId?.trim();
      if (!docId || !onOpenNotebookSource || !sources.some((s) => s.id === docId)) {
        return undefined;
      }
      return () =>
        onOpenNotebookSource(docId, {
          quote: reference.content,
          pageNumber: reference.metadata?.pageNumber ?? null,
        });
    },
    [onOpenNotebookSource, sources]
  );
```

`DeepResearchSourcesSection.tsx:51` — widen the prop type to match (its call site keeps passing only the id):

```tsx
  onOpenNotebookSource?: (documentId: string, focus?: SourceFocusTarget) => void;
```

with `import type { SourceFocusTarget } from "@/shared/types";`.

- [ ] **Step 6: Typecheck and run the web suite**

Run: `bun run typecheck:web`
Expected: no errors.

Run: `bun run test:web`
Expected: PASS (all tests).

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(chat): open a cited source at its passage and show its page" -- apps/web/src/features/sources/components/SourcesPanel.tsx apps/web/src/features/notebooks/components/views/NotebookView.tsx apps/web/src/features/chat/components/ChatPanel.tsx apps/web/src/features/chat/components/DeepResearchSourcesSection.tsx apps/web/src/features/chat/components/CitationCard.tsx apps/web/src/features/chat/components/CitationCard.test.tsx
```

---

### Task 10: Verify end to end and open the PR

- [ ] **Step 1: Validation gates** (run separately, not in parallel)

```bash
bun run typecheck:web
bun run typecheck:convex
bun run test:convex
bun run test:web
bun run lint
bun run lint:design
bun run knip
```

Expected: all pass.

- [ ] **Step 2: Chat retrieval eval**

Run: `bun run eval:rag --runner chat` (space before `chat`; `--runner=chat` is ignored and runs everything).
Expected: scores within noise of `main`. Evals ingest fixtures with the new chunker, so page-split chunks are exercised. If the dev Together key returns 402, stop and report it instead of debugging failures.

- [ ] **Step 3: Browser check**

Start the dev server with the preview tools (`bun run dev:web`, plus `npx convex dev --once` to push functions to the dev deployment). In a notebook, upload a multi-page PDF, wait for it to finish, ask a question that cites it, click a citation chip, then "open in sources". Confirm: the text view scrolls to a highlighted passage; the bar reads "Page N"; "Open PDF" shows that page. Take a screenshot for the PR.

- [ ] **Step 4: Backfill on dev**

Run: `npx convex run _migration/backfillChunkPages:start`, wait for the scheduled functions to finish (dashboard → Functions → Scheduled), then spot-check an older PDF's chunks have `pageNumber` set.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feature/citation-page-click-through
gh pr create --title "feat(sources): citations open the source at the cited passage and page" --body "<summary, test plan, screenshot; 'Part of #356 (1/4)'; note the backfill command to run on prod after deploy; end with the Claude Code attribution line>"
```

After merge and deploy, run the backfill on production: `npx convex run _migration/backfillChunkPages:start --prod` (ask the user first — it writes to production).

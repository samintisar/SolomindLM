# Literature review with notebook papers (#301)

**Status:** design, awaiting approval · **Date:** 2026-10-05

## Problem

Literature review mode only searches external databases (arXiv, Semantic Scholar, PubMed). It never reads the papers in the user's notebook. A researcher who uploads their own papers and runs a review gets a review of other people's papers. The landing page promises the opposite: "Work through literature review mode with papers in your notebook".

## Decisions (owner, 2026-10-05)

1. **Selected notebook papers are always included.** They skip screening and go straight to extraction, the table and the written review.
2. **Scope option:** **Your papers + search** (the default when papers are selected) or **Only your papers** (no external search).
3. **An off-topic notebook paper is still included but flagged** in the table and the review.

## What counts as a notebook paper

These sources count, provided they are selected in the sources panel, belong to the notebook and have `status: "completed"`:

- `fileType: "paper_record"` (saved papers);
- `fileType: "file"` when it is a PDF (`contentType` or a `.pdf` extension).

Pasted text, web pages and YouTube are not papers and are left out. If the user selects sources but none of them are papers, the review runs as today: search only. "Only your papers" is disabled in that case.

## Design

### Start

- `startLiteratureReview` (`convex/studio/literature_tables/index.ts`) takes two new arguments:
  - `documentIds?: Id<"documents">[]`
  - `paperScope?: "papers_and_search" | "papers_only"`
- It loads each document and keeps only the ones that meet the rules above. This is the access check, and the client filter is not trusted.
- It stores the kept ids and the scope on the session and passes them to the workflow.
- "Only your papers" with no valid papers is rejected with a clear error.

### Workflow (`_agents/literature_review/LiteratureReviewGraph.ts`)

1. **Plan:** unchanged. In papers-only mode it is only used for the columns and the title.
2. **Column checkpoint:** unchanged.
3. **New step `loadNotebookPapers`:** turns each document into the workflow's paper shape, with `origin: "notebook"` and a `documentId`.
   - **`paper_record`:** uses the saved metadata (title, authors, year, abstract, DOI, URL), mapped the same way as `embeddingJob.ts`.
   - **Uploaded PDF:** title from the file name. Authors and year come from one small LLM call over the first ~4K characters of `extractedMarkdown`, so citation keys read `Smith2024` rather than `Tit`. The abstract stand-in is `sourceGuide.summary`, or failing that the start of the text.
   - **Off-topic check:** the existing screening prompt (`screenOnePaperWithLlm`) runs on each notebook paper, but it doesn't gate anything. A "would exclude" verdict sets `offTopic: true` plus a reason.
   - It returns compact records only, never full text, to stay under the workflow journal's 1 MiB limit.
4. **Search, rank and screen:** unchanged for search results. They are skipped entirely in papers-only mode.
   - Search results that duplicate a notebook paper (same DOI, or same title + first author) are dropped, and the notebook copy wins.
5. **Included set:** notebook papers first (`includeReason: "From your notebook"`), then the screened search papers.
6. **Extraction:** for a paper with a `documentId`, the server loads that document's text with a larger budget (`NOTEBOOK_PAPER_TEXT_MAX_CHARS`, around 12K characters from `extractedMarkdown`) in place of the 1.2K abstract. Search papers keep today's abstract-only extraction.
7. **Table and report:**
   - **What's stored:** `origin` and `offTopic`/`offTopicReason` are kept on drafts, table rows and citations.
   - **What the report writer sees:** each paper's entry says "From the user's notebook", plus the off-topic reason when there is one. A general rule asks the writer to note flagged papers under limitations.
   - **Deterministic additions:** the Characteristics of Included Studies table marks notebook papers. An "Included from your notebook" note lists flagged papers with their reasons.
   - **PRISMA:** a new provenance count, `recordsFromNotebook`. The PRISMA methods block and diagram add a "From your notebook" box. In papers-only mode they say "No database search; review limited to N papers from your notebook".
8. **Retry:** in papers-only mode, a retry never restarts at search.

### Web

- **Composer:** in literature review mode, a scope menu sits next to the database menu. It shows "Your papers + search" (the default) and "Only your papers". It appears only when at least one selected source is a PDF or saved paper, and it says how many: "Your 4 papers + search".
- **Start call:** `ChatPanel` sends the selected PDF and saved-paper ids and the scope to `startLiteratureReview`.
- **Progress, table and report:**
  - The column card and the completion summary say "4 of your papers + 12 from search".
  - The table shows a **Your paper** badge and an **Off-topic?** badge with the reason on hover. "Add to notebook" is hidden for notebook rows.
  - The PRISMA summary and diagram show the notebook count.
- **Landing card:** the copy stays as it is, because it becomes true.

### Evals

- **Runner:** the literature review eval invoker and `literatureReviewEvalAction` take `documentIds` and `paperScope`. The eval action reimplements the workflow inline, so the notebook path is mirrored there through shared helpers, not copied.
- **Metrics:**
  - `lrSearchYield` and `lrScreeningInclusionRate` skip the papers-only case.
  - `lrPrismaConsistency` counts notebook papers.
- **Fixture:** `researchers/literature-review-dose-response` runs with the four pack papers selected. Its expected behaviour becomes: includes the four notebook papers, adds search results, and cites both. `expectedItems` gains distinctive terms from the pack papers (e.g. "TILDA", "NHANES").

## Delivery (three PRs, all closing toward #301)

1. **Backend:** start args and validation; the session fields; `loadNotebookPapers` with the off-topic check; merge and dedupe; extraction from document text; origin and flags through the table and report; PRISMA counts; papers-only skip; retry. Tests come first for the pure parts (mapping, dedupe, PRISMA text, merge order).
2. **Web:** the scope menu, sending the selected ids, the badges, the summaries and the PRISMA box.
3. **Evals:** the invoker and action arguments, notebook-aware metrics, and the Researchers fixture. Then a before/after run on dev.

PR 1 also works with no web change: without `documentIds` the workflow behaves exactly as today.

## Not in scope

- Fetching PDFs for search results; extraction for those stays abstract-only.
- Linking inline `[Key]` citations to the reference list. That's an existing gap, unrelated to this change.
- Letting a search result be promoted into the notebook from the review. "Add to notebook" stays as it is.

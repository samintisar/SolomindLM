# Open-access full text for paper sources — design

Issue #480.

## Goal

When a paper is added to a notebook (Discover, DOI/arXiv form, BibTeX, literature review "add to notebook"), the
import looks for a legal open-access copy in every known location before it settles for the abstract. Each paper
source records whether it holds full text or only the abstract, and which open-access version it used. Abstract-only
sources are labelled in the sources list and in citations, with actions to look again or attach a PDF.

## Problem

- `embeddingJob.ts` (`paper_record` branch) calls `AcademicLoaderService.loadPaper`, which tries the provider's
  `pdfUrl` with Mistral OCR, then scrapes the landing page, then builds a title + abstract stub. `loadPaper` never
  returns empty content, so `ingestionStatus` is set to `"ingested"` for every paper, including abstract stubs and
  scraped paywall pages. The `metadata_only` branch is unreachable.
- `fulltextStatus` is fixed at insert from `pdfUrl` alone (`deriveFulltextStatus`) and never revised. Together these
  make `SourceListItem` show "Full text" for papers that only have an abstract; the existing "Abstract" hint never
  appears.
- Only the first search provider's `pdfUrl` is tried. OpenAlex `locations` / `best_oa_location`, Unpaywall, and arXiv
  or PubMed Central copies are never consulted.
- Mistral is handed the URL directly, so an HTML or paywall page served at a `.pdf` URL is indistinguishable from a
  PDF until OCR fails.
- `literatureReview/notebookPapers.ts` labels any stored paper text "Full text (excerpt)", abstract stubs included.

Measured while designing (plain HTTP from a workstation): arXiv PDFs download as `%PDF`; PMC and Europe PMC PDF
endpoints return 403 or an HTML stub, but the PMC article page is full HTML text; a Nature `.pdf` URL returns the
HTML article page. A candidate URL can therefore yield a PDF, an HTML page holding the full article, or neither.

## Scope

In scope: import-time resolution for `paper_record` sources, labelling, the two actions, a backfill of existing
papers, and a coverage measurement.

Out of scope: deep research's in-memory full-text loading (`_agents/research/nodes.ts`) and `AcademicLoaderService`
callers other than paper import (evals); enriching search results before import; paywalled full text and
institutional proxies. These adjacent bugs get their own issues:

- `documents.addExternalSources` creates `paper_record` rows without `paperRecord`, so deep research "Add to sources"
  always fails ingest.
- Discover saves a 500-character snippet as the abstract and drops authors (`DiscoveryService.transformAcademicResult`).
- `deduplicatePapers` keeps the first provider's record and drops a later provider's `pdfUrl`.

## Design

### 1. Candidate resolution — `convex/_services/extraction/openAccess/OpenAccessResolver.ts`

Input: `{ doi?, openAlexId?, pdfUrl?, landingPageUrl? }` from the paper record.

Lookups, in parallel, each with a 10 s timeout and at most one retry on 429/5xx (via `invokeWithHttpRetry` with
`maxAttempts: 2`):

- **Unpaywall** — `GET https://api.unpaywall.org/v2/{doi}?email={contact}`. Read `oa_locations[]`:
  `url_for_pdf`, `url_for_landing_page`, `url`, `version` (`publishedVersion` | `acceptedVersion` |
  `submittedVersion`), `license`, `host_type`. A 404 means no candidates.
- **OpenAlex** — `GET https://api.openalex.org/works/doi:{doi}` (or `/works/{openAlexId}` when there is no DOI) with
  `select=ids,locations` and `mailto={contact}`. Read `locations[]` where `is_oa`: `pdf_url`, `landing_page_url`,
  `version`, `license`; and `ids.pmcid`.

Derived candidates:

- An arXiv location (host `arxiv.org`, or an arXiv `pmh_id`) gives `https://arxiv.org/pdf/{id}` as a PDF candidate.
- A PMCID, or a PMC / Europe PMC link in a location (including `pmh_id`s and Europe PMC render URLs), gives
  `https://pmc.ncbi.nlm.nih.gov/articles/PMC{n}/` as an HTML candidate.

Output: an ordered, de-duplicated list of `OaCandidate = { url, kind: "pdf" | "html", version?, license?, host }`.

- Order by version: published, accepted, submitted, unknown. Within a version, PDF before HTML.
- The paper record's own `pdfUrl` is included as a PDF candidate at its matched version (unknown if no location
  matches it).
- URLs are compared by host, path and query, ignoring scheme, trailing slash and fragment. A candidate keeps the
  scheme it was published with (`http` is not rewritten); when a duplicate arrives as `https`, the `https` form wins.
- With neither DOI nor OpenAlex id, the list is the record's `pdfUrl` (if any).
- Lookup failures are logged and produce no candidates; the resolver never throws.

Contact email: new optional env var `OPEN_ACCESS_CONTACT_EMAIL` in `convex/_lib/env.ts`, default
`support@solomindlm.com`, used for both APIs. Unpaywall allows 100,000 calls/day; import volume is far below that,
and each import makes exactly one Unpaywall call.

### 2. Fetching a candidate — `convex/_services/extraction/openAccess/fetchOaCandidate.ts`

`GET` with a 30 s timeout, a `SolomindLM/1.0 (mailto:{contact})` user agent, and a 50 MB cap (stop reading and
report `too_large` past it). Redirects (up to 5) are followed by hand: the first URL and every redirect target must
pass `isPublicHttpUrl` (`publicUrl.ts`: http(s) only, no loopback, private, link-local, CGNAT, multicast or
internal-only hosts), else `blocked_destination`. Classify the response:

- body starts with `%PDF-` (the first 1 KB is read and sniffed, so a leading BOM or whitespace is tolerated)
  → `{ type: "pdf", bytes }`
- `text/html` (or sniffed HTML) → `{ type: "html", finalUrl }`
- anything else, non-2xx, timeout → `{ type: "unusable", reason }`

### 3. Ingest order — `convex/documents/paperIngest.ts`

The `paper_record` branch of `embeddingJob` moves into `ingestPaper(ctx, doc, deps)`, which returns
`{ content, title?, outcome: "full_text" | "abstract_only", fullTextSource? }`. Steps, stopping at the first that
yields full text:

1. **Stored PDF** — if the document has a `storageId` (from "Upload PDF" or an earlier import), OCR it via
   `ctx.storage.getUrl`. Keeps the document's existing `fullTextSource` when it is `oa_pdf` or `uploaded_pdf`;
   otherwise records `{ method: "uploaded_pdf" }`. A transient OCR error (5xx, 429, network, timeout) is rethrown and
   fails the source, so the user can retry without losing the file. A permanent error (a corrupt PDF, a missing
   file) or empty text falls through to the next steps, and a working open-access PDF may then replace the
   unreadable one; the old file is deleted only after the replacement has given full text.
2. **Candidates** — run the resolver, then try candidates in order, at most 6 attempts, inside the overall
   deadline below:
   - `pdf`: store the bytes in Convex storage, set the document's `storageId`, OCR from the storage URL. Accept if
     the OCR text has at least 500 words and twice the abstract's (a cover sheet or notice fails). Source `{ method: "oa_pdf", url, version, license, host }`.
   - `html`: scrape `finalUrl` with the existing scraper (`scrapeWebPageInternal`). Accept if it passes the
     full-text test. Source `{ method: "oa_html", … }`.
   - A PDF that fails OCR is deleted from storage (the document points back at its earlier PDF) before moving
     on; a transient OCR error is rethrown after the delete, as in step 1.
   - Candidate URLs are tracked (including where a redirect ended) so the landing page is not scraped twice.
3. **Landing page** — scrape `fileUrl || landingPageUrl` if not already tried and at least 60 s of the deadline
   remain; accept under the full-text test.
   Source `{ method: "landing_page", url }`.
4. **Abstract** — store `buildPaperMetadataMarkdown(pr, title)` (which carries the "full text was not ingested"
   note); outcome `abstract_only`.

**Deadline.** Steps 1-3 share one 420 s deadline measured from the start of `ingestPaper`, leaving the embedding
job at least 180 s for chunking and embedding inside Convex's 600 s action limit. Before each candidate attempt
there must be room for its worst case: 220 s for a PDF (30 s fetch plus Mistral OCR with retries), 90 s for HTML
(30 s fetch plus a scrape). A PDF candidate that no longer fits is skipped and a later HTML one may still run;
when not even an HTML attempt fits, the loop stops. A PDF that turns up behind an HTML candidate is stored and
OCR'd only if 190 s remain. Skipped candidates don't count toward the 6 attempts. Resolver and fetch exceptions
are caught and treated as "no candidates" / "unusable".

**Full-text test** (`isFullTextLength(text, abstract)`): word count ≥ 1,500 **and** ≥ 3 × the abstract's word count.
Applies to scraped text only. OCR of an open-access PDF must pass a lower bar (`isPlausiblePdfText`): ≥ 500 words
**and** ≥ 2 × the abstract's word count, so a cover sheet or notice fails. OCR of a stored PDF (uploaded, or kept
from an earlier import) is accepted when non-empty. Words are counted with the CJK-aware `countWords` from
`convex/_lib/freeToolBounds.ts`.

`AcademicLoaderService` is unchanged and keeps serving deep research and evals.

### 4. Data model

- `ingestionStatus` for `paper_record`: `ingested` = full text; `metadata_only` = abstract only. Set from `outcome`.
- New optional field on `documents`: `fullTextSource: v.optional(v.object({ method: v.union("uploaded_pdf",
  "oa_pdf", "oa_html", "landing_page"), url: v.optional(v.string()), version: v.optional(v.union(
  "publishedVersion", "acceptedVersion", "submittedVersion")), license: v.optional(v.string()),
  host: v.optional(v.string()) }))`. Schema widening only.
- After ingest, `fulltextStatus` is set to `available` when full text was ingested. Otherwise it becomes
  `unavailable`, except that a row already marked `external_only` keeps that value.
- `prepareDocumentReembed` clears `fullTextSource` only when it swaps in a `newStorageId` (an uploaded PDF replaces
  whatever was there); otherwise it keeps it, so a re-ingest of a stored open-access PDF keeps its provenance.
- `listSummary` and `documentToSource` expose `fullTextSource` to the web app.

### 5. Labels

- `SourceListItem`: paper hint is **"Full text"** when `ingestionStatus === "ingested"`, **"Abstract only"** when
  `metadata_only`. A tooltip on "Full text" shows the version and licence when known, e.g. "Accepted manuscript ·
  CC BY".
- `CitationCard` / citation popover: an **"Abstract only"** marker when the cited source is an abstract-only paper,
  found by looking up `documentId` in the notebook source list the web app already holds. No backend change to search.
- `notebookPaperText` (literature review): returns the stored text labelled as full text only when
  `ingestionStatus === "ingested"`; otherwise the abstract, labelled "Abstract".

### 6. Actions on abstract-only sources

Shown in the source's `⋯` menu only (the "Abstract only" hint sits inside the row's open-source button, which
can't contain another control, so there is no inline link). They are also offered on failed paper rows.

- **Find full text** → new public mutation `documents.paperFullText.findFullText({ documentId })`. Checks the caller
  can edit the notebook, the document is a `paper_record`, and a per-user rate limit (`paperFullText`, 20/hour) in
  `convex/_lib/rateLimits.ts`. Calls `prepareDocumentReembed` (no new storage) to re-run ingest.
- **Upload PDF** → file picker → `generateUploadUrl` → new public mutation
  `documents.paperFullText.attachPdf({ documentId, storageId })`. Same access check; reads the blob's `_storage`
  system record and rejects anything not a PDF or over 50 MB. It only accepts a fresh, unreferenced upload: a blob
  that any `documents` or `audioOverviews` row references is refused and never deleted, and a rejected blob is
  deleted only if it was uploaded less than 15 minutes ago. Calls `prepareDocumentReembed` with `newStorageId`,
  which deletes any previously stored PDF. Step 1 of the ingest order
  then uses it.

Both show the source's normal processing state while ingest re-runs.

### 7. Backfill — `convex/_migration/backfillPaperFullText.ts`

Internal functions run by hand with `npx convex run`, dev first, then prod. Each takes `dryRun` and logs counts.

- **Relabel** — paginate `documents` (4 per batch, since stored markdown can be large; self-scheduling). For `paper_record` rows with
  `ingestionStatus: "ingested"` and no `fullTextSource`, apply the full-text test to `extractedMarkdown` against the
  abstract; failing rows become `metadata_only` / `unavailable`. No external calls.
- **Re-resolve** (opt in with `reResolve: true`, same pass) — only for papers relabeled in this pass that are
  completed and have a DOI, an OpenAlex id or a PDF link; papers that were already `metadata_only` were tried by the
  new pipeline and are never queued. Each is queued 10 s apart. The queued action runs the resolver with the
  record's ids and its own `pdfUrl` (the old pipeline never checked that link's output), re-checks that the row is
  still an abstract-only paper, and re-ingests when it finds any candidate. A relabel-only run gives up re-resolve
  for the papers it relabels. Counts are logged as one JSON line.

### 8. Measurement — `convex/eval/openAccessCoverage.ts`

An internal action run on the dev deployment (Convex's network, not a workstation's). It samples 200 DOIs from
OpenAlex (`/works?sample=200&seed=480&filter=has_doi:true,type:article`), then for each:

- **Before**: the provider link the old path would have used (OpenAlex `open_access.oa_url`) downloads as `%PDF`.
- **After**: the new order reaches a `%PDF` candidate or an HTML candidate passing the full-text test.

It skips OCR to keep cost down. It runs in batches of 15 papers (`offset`, `limit`) with a 450 s batch deadline,
skipping papers that would start after it, to stay inside the 600 s action limit. Each batch reports `total`,
`skipped`, `attempted`, `before`, `after`, `afterPdf`, `afterHtml`; compute the two shares over `attempted`, not
`total`, and break them down by method. The numbers go in the PR.

## Error handling

- Resolver lookups, candidate fetches, storage writes, OCR and scrapes each fail into "try the next step"; only an
  unexpected exception outside them fails the ingest (existing `failed` handling).
- Every step logs through `serviceLogger` with the document's `requestId`, including which candidate succeeded.
- The 420 s ingest deadline with per-attempt reserves keeps the whole embedding job inside Convex's 600 s action
  limit.
- A transient OCR failure on an already-stored PDF fails the source (retryable by the user); a permanent one or
  empty text falls through and a working open-access PDF may replace the file.

## Testing

TDD, `*.test.ts` next to source:

- `OpenAccessResolver`: version ordering, PDF before HTML, de-duplication, arXiv and PMC derivation, the record's own
  `pdfUrl`, Unpaywall 404 / 429 / timeout, OpenAlex failure, no DOI.
- `fetchOaCandidate`: `%PDF` detection, HTML, size cap, non-2xx, timeout.
- `isFullTextLength`.
- `paperIngest`: each step's success and fall-through with mocked services; stored PDF first; failed-OCR PDF deleted;
  deadline, reserves and attempt caps; stored-PDF transient vs permanent errors; outcome and `fullTextSource`.
- `findFullText` / `attachPdf` (convex-test): access, non-paper rejection, rate limit, content-type and size checks.
- Backfill relabel decision.
- Web: `SourceListItem` labels, tooltip and actions; `documentToSource`; citation marker; `notebookPapers` labelling.

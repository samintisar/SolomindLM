# Paper Import Streamlining — Design Spec

**Date:** 2026-05-09
**Status:** Approved
**Scope:** v1 implementation (hybrid A→B architecture)

---

## 1. Overview & Goals

**Goal:** Streamline adding academic papers to notebooks by supporting 4 new import methods that produce standard `paperRecord` objects feeding the existing document embedding pipeline.

**Import Methods:**

1. **DOI Resolver** — paste a DOI, auto-fetch metadata (Crossref) and open-access PDF (Semantic Scholar/OpenAlex)
2. **BibTeX/RIS Import** — upload .bib/.ris files or paste raw text, parse into paper records
3. **Zotero Import** — one-time import via exported BibTeX file, with refresh support
4. **Mendeley Import** — one-time import via exported BibTeX file (Mendeley API deprecated, not supported)
5. **Add Manually** — form to enter citation data directly

**Design Principle (Hybrid A→B):** Implement as extensions of the existing `upload` mutation and `AddSourceModal`, but keep parsing logic isolated in dedicated services so it can migrate to a standalone `paperImport` module later.

**Success Criteria:**

- User can add a paper by DOI in < 10 seconds
- User can import a BibTeX file with 50 papers in < 30 seconds
- User can refresh Zotero/Mendeley imports without duplicating existing papers
- All imported papers get the same treatment as existing `paper_record` sources (fulltext extraction, embedding, RAG availability)

---

## 2. Backend Architecture

### 2.1 DOI Resolver Flow

```
User pastes DOI
  → Frontend calls `resolveDoi` action
    → Backend validates DOI format (regex: 10\.\d{4,}/.+)
      → Query Crossref API for metadata (title, authors, abstract, venue, year)
        → Use batch endpoint for multiple DOIs: /works?filter=doi:X,doi:Y
      → Query Semantic Scholar API for PDF URL and OpenAlex ID
        → Use batch endpoint: POST /graph/v1/paper/batch
      → Fallback: Query OpenAlex for OA PDF URL if SS had none
    → Return structured paperRecord to frontend
  → User clicks "Add to Notebook"
    → Frontend calls `upload` mutation with type="paper_record"
      → Backend inserts document row, ingestionStatus="pending"
        → Scheduler triggers embedding pipeline
```

**Error States:**

- Invalid format → "Please enter a valid DOI (e.g., 10.1234/example)"
- DOI not found → "DOI not found. Check the DOI or try adding the paper manually."
- API down/rate limited → retry with exponential backoff (3 attempts); if still failing → "Academic metadata service temporarily unavailable. Try again later."
- PDF unavailable → NOT an error; show "Open Access" badge if available, otherwise "PDF unavailable — paper metadata saved, full text may be limited"

### 2.2 BibTeX/RIS Parser Flow

```
User uploads .bib file or pastes text
  → Frontend reads file as text (attempt UTF-8, fallback Latin-1)
    → Calls `parseBibliography` action with raw text + format hint
      → Backend detects format (file extension or content heuristics)
        → Parse entries with BibliographyParserService
          - BibTeX: custom parser (no external lib dependency in v1)
          - RIS: tag-based parser (TY, AU, TI, DO, etc.)
        → For each entry with DOI: resolve DOI (cached, batched via resolveDoi)
        → For entries without DOI: use parsed metadata directly
        → In-batch dedup: remove duplicate DOIs within same import
      → Return {papers: paperRecord[], stats: {total, withDoi, withoutDoi, malformed}}
  → Frontend shows preview with checkboxes
    → User selects papers, clicks "Import N papers"
      → Frontend calls `bulkUpload` mutation with array of paperRecords
        → Backend:
          - Validate 100-paper limit
          - Dedup against existing documents in notebook (DOI match → title+author hash)
          - Insert new documents in single transaction
          - Trigger embedding scheduler ONCE with all documentIds (pass array to single job, not one job per paper)
```

**Encoding Handling:**

- Attempt UTF-8 decode first
- If decode produces invalid characters, fallback to Latin-1
- Surface warning if non-ASCII characters look garbled after fallback

**Error States:**

- Malformed file → parse as many as possible, return partial with warning: "Parsed 45 of 50 entries. 5 entries were malformed and skipped."
- Missing DOI in entries → warning banner: "12 papers have no DOI. Metadata enrichment will be limited."
- All entries malformed → error: "Could not parse file. Ensure it is valid BibTeX or RIS format."
- File too large (>5MB) → error: "File too large. Export a subset of your library or paste the text directly."
- > 100 entries → "Your file contains 150 papers. Only the first 100 will be imported. Consider splitting your library."

### 2.3 Zotero Import Flow

**Primary Path:**

- Instructions modal: "Export your Zotero library as BibTeX, then upload below"
- File dropzone for .bib export
- On upload: reuse BibTeX parser flow → preview → bulkUpload

**Refresh Logic:**

- User clicks "Refresh from Zotero" → re-uploads latest export
- Parses into paperRecords
- Calls `getExistingPapers` query with notebookId
- Returns set of existing DOIs + title hashes
- Filters out duplicates (DOI match → title+author hash match)
- Shows preview of only NEW papers
- User confirms → bulk upload new papers only

**Error States:**

- No new papers → toast: "No new papers found in your Zotero export."
- Partial dedup → "Imported 30 papers. 20 already existed and were skipped."
- OAuth failure (if optional API enhancement added later) → "Could not connect to Zotero. Re-authenticate or export a BibTeX file manually."

### 2.4 Mendeley Import Flow

- Same pattern as Zotero but **BibTeX export only** (no API — Mendeley API is deprecated/unreliable)
- Identical refresh and dedup logic

### 2.5 Manual Paper Entry Flow

```
User clicks "Add Manually"
  → Opens form modal with fields:
    - Title* (string, required)
    - Authors* (array of strings, required)
    - Abstract (string, optional)
    - DOI (string, optional, validated if provided)
    - Venue (string, optional)
    - Year (number, optional)
    - PDF URL (string, optional, validated URL)
  → User fills form, clicks "Add Paper"
    → Frontend calls `upload` mutation with type="paper_record"
      → Backend inserts document with provided metadata
        → If DOI provided, attempts PDF resolution via AcademicLoaderService
        → Triggers embedding pipeline
```

### 2.6 paperRecord Schema

```typescript
interface PaperRecord {
  title: string;
  authors: string[];
  abstract: string;
  doi?: string;
  venue?: string;
  year?: number;
  pdfUrl?: string;
  landingPageUrl?: string;
  openAlexId?: string;
  isOa: boolean;
  sourceType: "doi" | "bibtex" | "ris" | "zotero" | "mendeley" | "manual";
}
```

---

## 3. Frontend UI

### 3.1 AddSourceModal Extension

The existing `AddSourceModal` grid gets 5 new/revised cards:

| Card                     | Action                                                       | Notes                       |
| ------------------------ | ------------------------------------------------------------ | --------------------------- |
| **Upload URL or DOI**    | Opens tabbed modal: "Website URL" / "DOI"                    | Replaces current "URL" card |
| **Search Papers Online** | Existing functionality                                       | No changes                  |
| **Upload File**          | Existing file upload                                         | No changes                  |
| **Import BibTeX or RIS** | Opens tabbed modal: "Upload File" (.bib/.ris) / "Paste Text" | New                         |
| **Import from Zotero**   | Opens instructions + file dropzone modal                     | New                         |
| **Import from Mendeley** | Opens instructions + file dropzone modal                     | New                         |
| **Add Manually**         | Opens form modal                                             | New                         |

### 3.2 DOI Resolver Modal

- Single input field with placeholder "10.1234/example"
- "Resolve" button → loading spinner
- On success: preview card showing:
  - Title (bold)
  - Authors (comma-separated)
  - Abstract (truncated to 3 lines, expandable)
  - PDF availability badge: "Open Access" (green) or "PDF unavailable" (gray)
- "Add to Notebook" button
- Error inline below input

### 3.3 BibTeX/RIS Import Modal

**Upload File Tab:**

- Drag-and-drop zone or file picker
- Accepts: `.bib`, `.ris`
- On upload: shows filename + "Parsing..."

**Paste Text Tab:**

- Large textarea with placeholder "Paste BibTeX or RIS content here..."
- "Parse" button

**Preview Stage (shared by both tabs):**

- Header: "Found N papers (M with DOI)"
- Scrollable list of paper cards:
  - Checkbox (default checked)
  - Title (bold)
  - First 2 authors + "et al." if more
  - Expand arrow → shows full metadata (abstract, venue, year, DOI)
- "Select All" / "Deselect All" toggle
- Warning banner (if applicable): "12 papers have no DOI — metadata enrichment will be limited"
- "Import N selected papers" button (disabled if none selected)

### 3.4 Zotero/Mendeley Import Modal

- Instructions text: "Export your library from [Zotero/Mendeley] as BibTeX, then upload the file below."
- Link to export instructions (external help page)
- File dropzone (accepts `.bib`)
- "Import" button
- "Refresh" button (shown after initial import): re-opens file picker for updated export

### 3.5 Manual Entry Modal

- Form with fields (see 2.5)
- Required fields marked with \*
- "Add Paper" button (disabled until title and authors provided)
- "Cancel" button

---

## 4. Data Flow & Integration

### 4.1 New Backend Components

| Component                   | Type     | Location                       | Purpose                                                      |
| --------------------------- | -------- | ------------------------------ | ------------------------------------------------------------ |
| `DoiResolverService`        | Service  | `convex/_services/extraction/` | Resolve DOIs to paperRecords via Crossref + Semantic Scholar |
| `BibliographyParserService` | Service  | `convex/_services/extraction/` | Parse BibTeX and RIS files into paperRecords                 |
| `resolveDoi`                | Action   | `convex/documents/`            | Public action for DOI resolution                             |
| `parseBibliography`         | Action   | `convex/documents/`            | Public action for BibTeX/RIS parsing                         |
| `bulkUpload`                | Mutation | `convex/documents/index.ts`    | Bulk insert papers with dedup and limit enforcement          |
| `getExistingPapers`         | Query    | `convex/documents/`            | Returns existing DOIs + title hashes for dedup               |

### 4.2 Modified Backend Components

| Component               | Change                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| `upload` mutation       | Add `sourceType` field to paperRecord; pass pdfUrl to AcademicLoaderService |
| `AcademicLoaderService` | Use `pdfUrl` from paperRecord if available instead of searching             |
| `AddSourceModal`        | Add new cards for paper import methods                                      |

### 4.3 New Frontend Components

| Component             | Purpose                           |
| --------------------- | --------------------------------- |
| `DoiInputModal`       | DOI paste + resolution preview    |
| `BibtexImportModal`   | BibTeX/RIS upload/paste + preview |
| `ZoteroImportModal`   | Zotero export upload + refresh    |
| `MendeleyImportModal` | Mendeley export upload + refresh  |
| `ManualPaperModal`    | Manual paper entry form           |

### 4.4 Integration with Existing Pipeline

All import methods ultimately produce `paperRecord` objects that flow through:

```
paperRecord → upload mutation → documents table (status=pending)
  → ctx.scheduler.runAfter() → docEmbedding action
    → AcademicLoaderService (uses pdfUrl if provided)
      → MistralOCR / text extraction
        → StructuralChunker
          → Embedding (Together AI E5)
            → documentChunks table
              → document status = "completed"
```

---

## 5. Error Handling & Edge Cases

### 5.1 DOI Resolution

| Scenario                         | Handling                                                                  |
| -------------------------------- | ------------------------------------------------------------------------- |
| Invalid DOI format               | Inline validation error with example                                      |
| DOI not found in Crossref        | Error: "DOI not found. Check the DOI or try adding manually."             |
| Crossref API down                | Retry 3x with exponential backoff; then "Service temporarily unavailable" |
| PDF unavailable                  | Warning (not error); proceed with metadata only                           |
| Rate limited by Semantic Scholar | Queue and batch; throttle client-side                                     |

### 5.2 BibTeX/RIS Parsing

| Scenario                  | Handling                                    |
| ------------------------- | ------------------------------------------- |
| Malformed file            | Parse partial, return stats, warning banner |
| Missing DOI in entries    | Warning banner (not blocking)               |
| All entries malformed     | Error: "Could not parse file"               |
| File > 5MB                | Error: "File too large"                     |
| > 100 entries             | Truncate to 100, warning                    |
| Duplicate DOIs in batch   | In-batch dedup before DB insertion          |
| Encoding issues (Latin-1) | Fallback decode, warning if garbled         |

### 5.3 Zotero/Mendeley Refresh

| Scenario               | Handling                                                 |
| ---------------------- | -------------------------------------------------------- |
| No new papers          | Toast: "No new papers found"                             |
| Partial dedup          | Toast: "Imported N. M already existed and were skipped." |
| Complete overwrite     | NOT supported in v1                                      |
| OAuth failure (future) | "Could not connect. Export BibTeX manually."             |

### 5.4 Bulk Upload

| Scenario              | Handling                                                      |
| --------------------- | ------------------------------------------------------------- |
| > 100 papers          | Server-side error: "Maximum 100 papers per import"            |
| All papers duplicates | Toast: "All papers already exist in this notebook"            |
| Partial failure       | Return `{imported, skipped, failed}`; show failed items in UI |

---

## 6. Testing & Validation

### 6.1 Unit Tests

**DoiResolverService:**

- Valid DOI → returns complete paperRecord with all fields
- DOI not found → returns null, sets appropriate error code
- PDF unavailable → paperRecord with `isOa: false`, `pdfUrl: undefined`
- Invalid DOI format → throws `InputValidationError`
- Batch resolution → single API call for multiple DOIs

**BibliographyParserService:**

- Parse 50-entry BibTeX → returns 50 paperRecords
- Malformed entries → parses partial, returns correct stats
- Missing DOI entries → returns entries with only parsed metadata
- Encoding fallback → Latin-1 file decodes correctly
- In-batch dedup → duplicate DOIs in same file only produce one record
- RIS format → correctly parses TY/AU/TI/DO tags

**bulkUpload mutation:**

- 50 papers → inserts 50 documents, triggers scheduler exactly once
- 101 papers → throws limit error before any inserts
- Dedup against existing → skips duplicates, imports new only
- All duplicates → returns `{imported: 0, skipped: 50, failed: 0}`
- Mixed success → returns accurate counts for each category

**Encoding fallback:**

- `.bib` file with Latin-1 encoded special characters (e.g., `{"u}` vs `ü`) → correct output after fallback

### 6.2 Integration Tests

- End-to-end DOI flow: paste DOI → resolve → upload → verify document row created with correct paperRecord
- End-to-end BibTeX flow: upload file → parse → preview → select all → bulkUpload → verify all documents created
- Zotero refresh: initial import → refresh with updated export → verify only new papers added

### 6.3 Manual QA Checklist

- [ ] DOI "10.1038/nature12373" resolves and adds correctly
- [ ] BibTeX file with 50 papers imports in < 30 seconds
- [ ] RIS file from EndNote imports correctly
- [ ] Zotero export (BibTeX) imports and deduplicates on refresh
- [ ] Mendeley export (BibTeX) imports correctly
- [ ] Papers without DOI still get added with manual metadata
- [ ] 100-paper limit enforced
- [ ] BibTeX with >100 entries imports first 100 (preserves order, not random)
- [ ] Manual entry form adds paper with all fields
- [ ] Error states display correctly (invalid DOI, malformed file, API down)
- [ ] Encoding fallback works for non-UTF-8 files

### 6.4 Performance Monitoring

- Log DOI resolution time per paper (target: < 2s for single, < 10s for batch of 50)
- Log BibTeX parse time and entry count
- Alert if PDF unavailability rate > 30% (indicates pipeline issue)
- Monitor bulkUpload transaction time

---

## 7. V1 Scope & Out-of-Scope

### 7.1 In Scope (v1)

- [x] DOI resolver with metadata + PDF (best effort)
- [x] BibTeX import (file upload + text paste)
- [x] RIS import (file upload + text paste)
- [x] Zotero import (BibTeX export)
- [x] Mendeley import (BibTeX export)
- [x] Manual paper entry form
- [x] Deduplication (DOI canonical, title+author hash fallback)
- [x] In-batch dedup for BibTeX/RIS imports
- [x] Encoding fallback (UTF-8 → Latin-1)
- [x] 100-paper import limit (server-side enforced)
- [x] Refresh for Zotero/Mendeley (additive only, no overwrite)

### 7.2 Out of Scope (Future)

- [ ] Zotero API OAuth integration
- [ ] Mendeley API integration (API deprecated)
- [ ] Live sync / automatic background sync
- [ ] EndNote, RefWorks, or other reference manager imports
- [ ] CSL-JSON import
- [ ] Import from arXiv ID
- [ ] Import from PubMed ID
- [ ] Bulk overwrite / replace existing papers
- [ ] Custom BibTeX field mapping
- [ ] Citation style preview

---

## 8. Dependencies

**No new major dependencies in v1.**

- BibTeX parsing: custom parser (avoids `bibtex-parse-js` dependency)
- RIS parsing: custom tag-based parser
- DOI resolution: uses existing HTTP fetch (no new client)

**Optional future dependencies:**

- `bibtex-parse-js` or `citation-js` if custom parser becomes unmaintainable
- Zotero API client (if OAuth integration added)

---

## 9. Risk Mitigation

| Risk                                 | Mitigation                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| Crossref API rate limits             | Use polite pool (+email header); batch DOI queries; implement client-side throttling     |
| Semantic Scholar rate limits         | Batch lookups via POST endpoint; cache results; throttle bulk imports                    |
| BibTeX parsing edge cases            | Graceful partial parsing; surface malformed entries; don't fail entire import            |
| Encoding issues                      | UTF-8 → Latin-1 fallback; warning banner for garbled output                              |
| Large file uploads                   | 5MB file limit; 100-paper limit; suggest splitting library                               |
| Duplicate imports                    | In-batch dedup + DB-level dedup (DOI + title hash); clear user feedback                  |
| Mendeley API deprecation             | Only support BibTeX export; no API dependency                                            |
| Future migration to dedicated module | Parse logic isolated in services; clear interfaces; no tight coupling to upload mutation |

---

## 10. Migration Path (A → B)

When ready to migrate to a dedicated `paperImport` module:

1. Move `DoiResolverService` and `BibliographyParserService` to `convex/_services/paperImport/`
2. Extract `resolveDoi`, `parseBibliography`, `bulkUpload`, `getExistingPapers` into `convex/paperImport/` module
3. Update `AddSourceModal` to route to `paperImport` modals instead of inline cards
4. Keep `upload` mutation backward-compatible (still accepts `paperRecord` objects)
5. No data migration needed (documents table schema unchanged)

---

## Appendix A: API Specifications

### resolveDoi

```typescript
// Action
resolveDoi(ctx, { doi: string }): Promise<PaperRecord | null>

// Errors:
// - InputValidationError: invalid DOI format
// - ExternalServiceError: Crossref/SS API failure after retries
```

### parseBibliography

```typescript
// Action
parseBibliography(ctx, {
  content: string,
  format?: "auto" | "bibtex" | "ris"
}): Promise<{
  papers: PaperRecord[],
  stats: {
    total: number,
    withDoi: number,
    withoutDoi: number,
    malformed: number
  }
}>

// Errors:
// - InputValidationError: unparseable content
// - LimitError: > 100 entries
```

### bulkUpload

```typescript
// Mutation
bulkUpload(ctx, {
  notebookId: Id<"notebooks">,
  papers: PaperRecord[]
}): Promise<{
  imported: number,
  skipped: number,
  failed: number,
  documentIds: Id<"documents">[]
}>

// Errors:
// - LimitError: > 100 papers
// - InputValidationError: invalid paperRecord
```

### getExistingPapers

```typescript
// Query
getExistingPapers(ctx, {
  notebookId: Id<"notebooks">
}): Promise<{
  dois: string[],
  titleHashes: string[]  // hash of lowercase title + first author surname
}>
```

---

## Appendix B: UI Component Props

### DoiInputModal

```typescript
interface DoiInputModalProps {
  notebookId: Id<"notebooks">;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (documentId: Id<"documents">) => void;
}
```

### BibtexImportModal

```typescript
interface BibtexImportModalProps {
  notebookId: Id<"notebooks">;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (documentIds: Id<"documents">[]) => void;
}
```

### ZoteroImportModal / MendeleyImportModal

```typescript
interface ReferenceManagerImportModalProps {
  notebookId: Id<"notebooks">;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (documentIds: Id<"documents">[]) => void;
  manager: "zotero" | "mendeley";
}
```

### ManualPaperModal

```typescript
interface ManualPaperModalProps {
  notebookId: Id<"notebooks">;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (documentId: Id<"documents">) => void;
}
```

# Firecrawl Web Acquisition Architecture

## Summary

Hard-cut replacement of Tavily + Supadata-web + OpenAlex with Firecrawl for web search/extraction and a real academic stack (arXiv + Semantic Scholar + PubMed). Vendor names removed from service boundaries. Zero compatibility shims — old files are deleted, new files written from scratch.

## Goals

- **Web search:** Firecrawl `/search` replaces Tavily for web/news/finance discovery.
- **Web extraction:** Firecrawl `/scrape`, `/crawl`, `/map` replaces Supadata web scraping.
- **Social transcripts:** Supadata kept only for YouTube/TikTok/Instagram/X.
- **Academic discovery:** arXiv + Semantic Scholar + PubMed replace OpenAlex (metadata-only, no full-text).
- **Academic loading:** PDF download → existing Mistral OCR pipeline; abstract-only papers get Firecrawl scrape fallback.
- **Clean names:** No vendor names in service files.

## Non-Goals

- No frontend changes.
- No schema changes.
- No changes to vector/hybrid search, reranking, or embedding pipelines.
- No migration of existing data (dev-only, no prod users).

---

## Service Architecture

### New Services

| Service | File | Backed By | Responsibility |
|---------|------|-----------|----------------|
| `FirecrawlSearchService` | `convex/_services/search/FirecrawlSearchService.ts` | Firecrawl `/search` | Web/news/finance search with inline markdown extraction. Replaces `TavilySearchService`. |
| `AcademicSearchService` | `convex/_services/search/AcademicSearchService.ts` | arXiv API + Semantic Scholar API + PubMed E-utilities | Full academic paper discovery with open-access PDF URLs. Replaces `OpenAlexSearchService`. |
| `WebLoaderService` | `convex/_services/extraction/WebLoaderService.ts` | Firecrawl (`/scrape`, `/crawl`, `/map`) + Supadata (`transcript` API) | Web page scrape/crawl/map + social media transcripts. Replaces `SupadataLoaderService`. |
| `AcademicLoaderService` | `convex/_services/extraction/AcademicLoaderService.ts` | HTTP fetch + Mistral OCR + Firecrawl fallback | Download open-access PDFs → OCR → text. Scrape abstracts when no PDF. |

### Kept / Orchestrator

| Service | File | Responsibility |
|---------|------|----------------|
| `DiscoveryService` | `convex/_services/search/DiscoveryService.ts` | Parallel dispatch to `FirecrawlSearchService` + `AcademicSearchService`, result distribution, sorting. |

### Deleted

- `convex/_services/search/TavilySearchService.ts`
- `convex/_services/search/OpenAlexSearchService.ts`
- `convex/_services/extraction/SupadataLoaderService.ts`

---

## Data Contracts (Stable Boundaries)

### `DiscoveredSource` (search result)

All search services return:

```ts
interface DiscoveredSource {
  title: string;
  url: string;
  snippet: string;
  score: number;
  publishedDate?: string;
  domain?: string;
  rawContent?: string; // markdown when inline extraction included
  metadata?: {
    pdfUrl?: string;
    doi?: string;
    citationCount?: number;
    sourceApi?: "arxiv" | "semantic_scholar" | "pubmed";
  };
}
```

`DiscoveryService` and chat stream consumers need **no changes**.

### `WebPageMeta` (web scrape result)

```ts
interface WebPageMeta {
  title: string;
  content: string; // cleaned markdown
  url: string;
}
```

### `TranscriptMeta` (social transcript)

```ts
interface TranscriptMeta {
  title: string;
  content: string;
}
```

### `AcademicPaper` (academic search result)

```ts
interface AcademicPaper {
  title: string;
  authors: string[];
  year?: number;
  abstract: string;
  url: string; // DOI, arXiv, or landing page
  pdfUrl?: string; // open-access PDF if available
  source: "arxiv" | "semantic_scholar" | "pubmed";
  citationCount?: number;
  doi?: string;
}
```

---

## FirecrawlSearchService

### Internal Action: `searchInternal`

**Args:** `query`, `maxResults`, `scoreThreshold`, `excludeDomains`, `includeDomains`, `topic`, `timeRange`, `searchDepth`

**Behavior:**
1. Init Firecrawl client with `env.FIRECRAWL_API_KEY`.
2. Map `topic`:
   - `"general"` / `"web"` → no source filter
   - `"news"` → `sources: ["news"]`
   - `"finance"` → no source filter (Firecrawl has no dedicated finance topic)
3. Map `timeRange` → `tbs`:
   - `"day"` → `"qdr:d"`
   - `"week"` → `"qdr:w"`
   - `"month"` → `"qdr:m"`
   - `"year"` → `"qdr:y"`
4. Call `firecrawl.search(query, { limit: maxResults, sources: [...], tbs: ..., scrapeOptions: { formats: ["markdown"], maxAge: 3600000, proxy: "auto", parsers: [] } })`.
5. Transform `data.web` → `DiscoveredSource[]`.
6. Filter by `scoreThreshold`, sort by score desc.
7. Return.

### Internal Action: `discoverSourcesInternal`

Same caching logic (`searchCache`) as today, delegates to `searchInternal`.

---

## AcademicSearchService

### Internal Action: `discoverAcademicPapersInternal`

**Args:** `query`, `maxResults`, `publicationYearFrom?`, `publicationYearTo?`, `minCitations?`, `openAccessOnly?`, `sortBy?`

**Behavior:**
1. **arXiv search:** Call `export.arxiv.org/api/query?search_query=all:${query}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`. Parse Atom XML → title, authors, summary, pdf_url, published year.
2. **Semantic Scholar search:** Call `api.semanticscholar.org/graph/v1/paper/search?query=${query}&fields=title,authors,year,abstract,openAccessPdf,citationCount,externalIds,url&limit=${maxResults}`. Parse JSON → title, authors, year, abstract, openAccessPdf.url, citationCount, DOI.
3. **PubMed search (biomed queries):** Call `eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=${query}&retmax=${maxResults}&sort=relevance`. Get PMC IDs, then `efetch` for metadata. Extract title, authors, abstract, PDF URL (PMC open-access).
4. **Rate-limit between calls:** 200ms delay between parallel academic API calls (PubMed E-utilities enforces 3 req/s; arXiv prefers politeness).
5. **Deduplicate** by DOI or normalized title.
6. **Filter:** year range, min citations, open access only.
7. **Sort** by relevance or citations.
8. **Transform** to `DiscoveredSource[]` for DiscoveryService compatibility:
   - `title` → paper title
   - `url` → DOI or landing page
   - `snippet` → abstract (first 500 chars)
   - `score` → normalized relevance/citation score
   - `rawContent` → full abstract markdown
   - Store `pdfUrl` in metadata for AcademicLoaderService downstream.

---

## WebLoaderService

### Methods

```ts
class WebLoaderService {
  // Firecrawl-backed
  async loadWebPage(url: string): Promise<string>
  async loadWebPageWithMeta(url: string): Promise<WebPageMeta>
  async startCrawl(url: string, limit?: number): Promise<{ jobId: string }>
  async checkCrawlStatus(jobId: string): Promise<{ status: string; pages?: Array<{ url: string; content: string }> }>
  async mapWebsite(url: string): Promise<{ urls: string[] }>

  // Supadata-backed
  async loadSocialTranscript(url: string, lang?: string): Promise<string>
  async loadSocialTranscriptWithMeta(url: string, lang?: string): Promise<TranscriptMeta>
  isSocialPlatform(url: string): boolean
}
```

**`loadWebPageWithMeta`:**
- Validate URL.
- `firecrawl.scrape(url, { formats: ["markdown"], proxy: "auto", parsers: [] })`.
- Apply `stripMedia` + `stripCookieConsentNoise`.
- Return `{ title, content }`.

**`startCrawl`:**
- `firecrawl.crawl(url, { limit, scrapeOptions: { formats: ["markdown"], proxy: "auto" } })`.
- Returns `{ jobId }` immediately. Does **not** poll or block.
- Caller (e.g. `crawlJobs` mutation) stores `jobId` and schedules a follow-up.

**Crawl completion handling (async):**
- Firecrawl webhook → Convex HTTP action that writes crawl results to a `crawlJobs` table.
- Fallback: scheduled Convex action polls `firecrawl.checkCrawlStatus(jobId)` every 10s until `completed` / `failed` / timeout.
- Embedding pipeline queues crawl jobs and resumes when webhook/scheduled action marks done.

**`mapWebsite`:**
- `firecrawl.map(url)`.
- Return URLs.

**`loadSocialTranscriptWithMeta`:**
- Validate URL.
- `supadata.transcript({ url, lang, text: true, mode: "auto" })`.
- Poll async jobs.
- Apply `stripMedia`.
- Return `{ title, content }`.

---

## AcademicLoaderService

### Method: `loadPaper`

```ts
async function loadPaper(paper: AcademicPaper): Promise<{ title: string; content: string; source: string }>
```

**Behavior:**
1. If `paper.pdfUrl` exists:
   - Download PDF via `fetch`.
   - Pass to `MistralOCRService.processDocument(pdfUrl)` (existing service).
   - Return OCR text.
2. If no PDF but landing page/abstract URL exists:
   - `WebLoaderService.loadWebPageWithMeta(paper.url)` to scrape abstract + body.
   - Return scraped text.
3. If neither works:
   - Return structured markdown from metadata: title, authors, abstract, year, citations.

---

## Call-Site Updates

### `convex/_services/search/DiscoveryService.ts`

- Replace `internal._services.search.TavilySearchService.discoverSourcesInternal` → `internal._services.search.FirecrawlSearchService.discoverSourcesInternal`.
- Replace `internal._services.search.OpenAlexSearchService.discoverAcademicPapersInternal` → `internal._services.search.AcademicSearchService.discoverAcademicPapersInternal`.
- Rename `transformTavilyResult` → `transformWebResult`.
- Add `transformAcademicResult` for academic paper → `DiscoveredSource` mapping.

### `convex/chat/stream.ts`

- Replace Tavily action call → `FirecrawlSearchService.discoverSourcesInternal`.
- No changes to external source chunking logic.

### `convex/documents/embeddingJob.ts`

- Replace `new SupadataLoaderService()` → `new WebLoaderService()`.
- YouTube transcripts → `webLoader.loadSocialTranscriptWithMeta()`.
- URL docs → `webLoader.loadWebPageWithMeta()`.
- Paper records → `new AcademicLoaderService().loadPaper(paperRecord)` (or inline logic if loader is thin).

### `convex/_services/extractors.ts`

- `scrapeUrl` → `WebLoaderService.loadWebPage`.
- `getYouTubeTranscript` → `WebLoaderService.loadSocialTranscript`.

---

## Environment & Dependencies

### New

- `FIRECRAWL_API_KEY` in `convex/_lib/env.ts`
- `@mendable/firecrawl-js` in `package.json`

### New (Academic APIs)

- `SEMANTIC_SCHOLAR_API_KEY` in `convex/_lib/env.ts` — raises rate limit from 100/5min to much higher tier.
- `PUBMED_EMAIL` in `convex/_lib/env.ts` — required by NCBI E-utilities terms of use.

### Kept

- `SUPADATA_API_KEY` in `convex/_lib/env.ts`
- `@supadata/js` in `package.json`
- `MISTRAL_API_KEY` in `convex/_lib/env.ts` (for academic PDF OCR)

### Removed

- `TAVILY_API_KEY` from `convex/_lib/env.ts`
- `OPENALEX_BASE_URL` from `convex/_lib/env.ts` (or keep if used elsewhere)

---

## Error Handling

- Firecrawl errors → `ExternalServiceError` via status code mapping.
- arXiv/Semantic Scholar/PubMed errors → `ExternalServiceError` with source label.
- `FirecrawlSearchService` logs as `"firecrawl"`.
- `AcademicSearchService` logs as `"academic_search"`.
- `WebLoaderService` logs as `"web_loader"` / `"supadata"` (social methods).
- `AcademicLoaderService` logs as `"academic_loader"`.
- Retry patterns mirror existing HTTP retry behavior.

---

## Testing Plan

- `bun run typecheck:convex` + `bun run typecheck:web` — must pass.
- `bun run lint` — must pass.
- `bun run test:convex` — existing tests.
- Manual smoke test:
  1. Source discovery (web + news + academic).
  2. Chat with external channels.
  3. Add URL source → verify embedding.
  4. Add YouTube source → verify transcript.
  5. Add academic paper → verify PDF OCR or abstract scrape.

---

## Rollback

Git revert. No shims, no deprecated files.

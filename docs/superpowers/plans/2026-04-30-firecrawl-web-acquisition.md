# Firecrawl Web Acquisition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tavily + OpenAlex + Supadata-web scraping with Firecrawl for web search/extraction and a real academic stack (arXiv + Semantic Scholar + PubMed), while keeping Supadata only for social transcripts.

**Architecture:** Four new service files (FirecrawlSearchService, AcademicSearchService, WebLoaderService, AcademicLoaderService) replace three deleted ones. DiscoveryService and embedding pipeline get new call-site updates. No schema changes, no frontend changes, no migration of existing data.

**Tech Stack:** Convex (TypeScript), Firecrawl (`@mendable/firecrawl-js`), arXiv API (Atom XML), Semantic Scholar API (JSON), PubMed E-utilities (XML), Supadata (`@supadata/js`), Mistral OCR.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `convex/_services/search/FirecrawlSearchService.ts` | **Create** | Firecrawl `/search` for web/news/finance discovery |
| `convex/_services/search/AcademicSearchService.ts` | **Create** | arXiv + Semantic Scholar + PubMed academic discovery |
| `convex/_services/extraction/WebLoaderService.ts` | **Create** | Firecrawl scrape/crawl/map + Supadata social transcripts |
| `convex/_services/extraction/AcademicLoaderService.ts` | **Create** | PDF download → Mistral OCR → text; abstract fallback |
| `convex/_services/search/DiscoveryService.ts` | **Modify** | Wire new search services, update transforms |
| `convex/chat/stream.ts` | **Modify** | Replace Tavily call with FirecrawlSearchService |
| `convex/documents/embeddingJob.ts` | **Modify** | Replace SupadataLoaderService with WebLoaderService + AcademicLoaderService |
| `convex/_services/extractors.ts` | **Modify** | Replace scrapeUrl/getYouTubeTranscript with WebLoaderService |
| `convex/_lib/env.ts` | **Modify** | Add FIRECRAWL_API_KEY, SEMANTIC_SCHOLAR_API_KEY, PUBMED_EMAIL; remove TAVILY_API_KEY, OPENALEX_BASE_URL |
| `package.json` | **Modify** | Add `@mendable/firecrawl-js` |
| `convex/_services/search/TavilySearchService.ts` | **Delete** | Replaced by FirecrawlSearchService |
| `convex/_services/search/OpenAlexSearchService.ts` | **Delete** | Replaced by AcademicSearchService |
| `convex/_services/extraction/SupadataLoaderService.ts` | **Delete** | Replaced by WebLoaderService |
| `convex/_lib/resolveOpenAlexSourceUrl.ts` | **Delete** | No longer needed (OpenAlex removed) |

---

## Task 1: Add Firecrawl Dependency and Environment Variables

**Files:**
- Modify: `package.json`
- Modify: `convex/_lib/env.ts`

- [ ] **Step 1: Install `@mendable/firecrawl-js`**

```bash
bun add @mendable/firecrawl-js
```

Expected: package installs successfully, `package.json` updated.

- [ ] **Step 2: Update `package.json` dependency entry**

Ensure `package.json` dependencies section includes:

```json
"@mendable/firecrawl-js": "^1.0.0"
```

(Use whatever version bun resolved.)

- [ ] **Step 3: Update `convex/_lib/env.ts`**

Replace the Tavily and OpenAlex entries with Firecrawl and academic API entries:

```typescript
  // Firecrawl (web search + extraction)
  FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || "",

  // Academic APIs
  SEMANTIC_SCHOLAR_API_KEY: process.env.SEMANTIC_SCHOLAR_API_KEY || "",
  PUBMED_EMAIL: process.env.PUBMED_EMAIL || "",
```

Remove these lines entirely:
```typescript
  // Tavily (web search)
  TAVILY_API_KEY: process.env.TAVILY_API_KEY || "",

  // OpenAlex (academic papers)
  OPENALEX_BASE_URL: process.env.OPENALEX_BASE_URL || "https://api.openalex.org",
```

The Supadata and Mistral entries stay as-is.

- [ ] **Step 4: Commit**

```bash
git add package.json convex/_lib/env.ts
git commit -m "chore: add firecrawl dependency and env vars, remove tavily/openalex"
```

---

## Task 2: Create FirecrawlSearchService

**Files:**
- Create: `convex/_services/search/FirecrawlSearchService.ts`

- [ ] **Step 1: Write `FirecrawlSearchService.ts`**

```typescript
"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { createCachedAction } from "../cache/cachedAgent";
import { CACHE_TTL, withJitter } from "../cache/cache";
import { internal } from "../../_generated/api";
import { env } from "../../_lib/env";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { createExternalServiceErrorFromResponse } from "../../_lib/errors";
import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import FirecrawlApp from "@mendable/firecrawl-js";

export interface DiscoveredSource {
  title: string;
  url: string;
  snippet: string;
  score: number;
  publishedDate?: string;
  domain?: string;
  rawContent?: string;
  metadata?: {
    pdfUrl?: string;
    doi?: string;
    citationCount?: number;
    sourceApi?: "arxiv" | "semantic_scholar" | "pubmed";
  };
}

// ============================================================
// Internal Action (makes actual API call)
// ============================================================

export const searchInternal = internalAction({
  args: {
    query: v.string(),
    maxResults: v.number(),
    scoreThreshold: v.number(),
    excludeDomains: v.optional(v.array(v.string())),
    includeDomains: v.optional(v.array(v.string())),
    topic: v.optional(v.string()),
    timeRange: v.optional(v.string()),
    searchDepth: v.optional(v.string()),
  },
  handler: async (
    _,
    {
      query,
      maxResults,
      scoreThreshold,
      excludeDomains,
      includeDomains,
      topic,
      timeRange,
      searchDepth,
    }
  ) => {
    const logger = createServiceLogger("firecrawl", "searchInternal");
    const startTime = Date.now();
    logger.operationStart({
      queryLen: query.length,
      topic: topic || "general",
      timeRange: timeRange ?? null,
      maxResults,
    });

    const apiKey = env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      logger.error("FIRECRAWL_API_KEY is not configured");
      throw new Error("FIRECRAWL_API_KEY is not configured");
    }

    const firecrawl = new FirecrawlApp({ apiKey });

    // Map topic to Firecrawl sources filter
    const sources: string[] | undefined =
      topic === "news" ? ["news"] : undefined;

    // Map timeRange to Google tbs parameter
    const tbsMap: Record<string, string> = {
      day: "qdr:d",
      week: "qdr:w",
      month: "qdr:m",
      year: "qdr:y",
    };
    const tbs = timeRange ? tbsMap[timeRange] : undefined;

    try {
      const data = await invokeWithHttpRetry(async () => {
        const t0 = Date.now();
        logger.apiCall("firecrawl", "/search", {
          topic: topic || "general",
          maxResults,
        });

        const result = await firecrawl.search(query, {
          limit: maxResults,
          ...(sources ? { sources } : {}),
          ...(tbs ? { tbs } : {}),
          scrapeOptions: {
            formats: ["markdown"],
            maxAge: 3600000,
            proxy: "auto",
            parsers: [],
          },
        });

        logger.apiSuccess("firecrawl", "/search", Date.now() - t0, { maxResults });
        return result as {
          data?: {
            web?: Array<{
              title?: string;
              url?: string;
              snippet?: string;
              score?: number;
              publishedDate?: string;
              domain?: string;
              rawContent?: string;
            }>;
          };
        };
      }, "firecrawl_search");

      let sourcesList: DiscoveredSource[] = (data.data?.web || []).map(
        (result: any) => ({
          title: result.title || "Untitled",
          url: result.url || "",
          snippet: result.snippet || "",
          score: result.score || 0,
          publishedDate: result.publishedDate,
          domain: result.domain || (result.url ? new URL(result.url).hostname : undefined),
          rawContent: result.rawContent || undefined,
        })
      );

      sourcesList = sourcesList.filter((source) => source.score >= scoreThreshold);
      sourcesList.sort((a, b) => b.score - a.score);

      logger.operationComplete({ count: sourcesList.length, durationMs: Date.now() - startTime });
      return sourcesList;
    } catch (error) {
      logger.operationError(error);
      throw error;
    }
  },
});

// ============================================================
// Cached Wrapper
// ============================================================

const searchCache = createCachedAction(
  internal._services.search.FirecrawlSearchService.searchInternal,
  { ttl: withJitter(CACHE_TTL.search, 0.15), name: "firecrawl-search" }
);

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

// ============================================================
// Public Cached Action
// ============================================================

export const discoverSourcesInternal = internalAction({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
    scoreThreshold: v.optional(v.number()),
    excludeDomains: v.optional(v.array(v.string())),
    includeDomains: v.optional(v.array(v.string())),
    topic: v.optional(v.string()),
    timeRange: v.optional(v.string()),
    searchDepth: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const logger = createServiceLogger("firecrawl", "discoverSourcesInternal");
    const startTime = Date.now();
    const normalizedQuery = normalizeQuery(args.query);

    logger.operationStart({
      queryPreview: normalizedQuery.substring(0, 50),
      topic: args.topic || "general",
      timeRange: args.timeRange ?? null,
    });

    try {
      const result = await searchCache.fetch(ctx, {
        query: normalizedQuery,
        maxResults: args.maxResults ?? 10,
        scoreThreshold: args.scoreThreshold ?? 0.5,
        excludeDomains: args.excludeDomains,
        includeDomains: args.includeDomains,
        topic: args.topic,
        timeRange: args.timeRange,
        searchDepth: args.searchDepth,
      });

      logger.operationComplete({
        count: result.length,
        durationMs: Date.now() - startTime,
      });
      return result;
    } catch (error) {
      logger.operationError(error);
      throw error;
    }
  },
});
```

- [ ] **Step 2: Run typecheck to verify new file compiles**

```bash
bun run typecheck:convex
```

Expected: no errors in FirecrawlSearchService.ts.

- [ ] **Step 3: Commit**

```bash
git add convex/_services/search/FirecrawlSearchService.ts
git commit -m "feat: add FirecrawlSearchService for web/news/finance discovery"
```

---

## Task 3: Create AcademicSearchService

**Files:**
- Create: `convex/_services/search/AcademicSearchService.ts`

- [ ] **Step 1: Write `AcademicSearchService.ts`**

```typescript
"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { createCachedAction } from "../cache/cachedAgent";
import { CACHE_TTL, withJitter } from "../cache/cache";
import { internal } from "../../_generated/api";
import { env } from "../../_lib/env";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { createExternalServiceErrorFromResponse } from "../../_lib/errors";
import { invokeWithHttpRetry } from "../../_agents/_shared/retry";

export interface AcademicPaper {
  title: string;
  authors: string[];
  year?: number;
  abstract: string;
  url: string;
  pdfUrl?: string;
  source: "arxiv" | "semantic_scholar" | "pubmed";
  citationCount?: number;
  doi?: string;
}

export interface DiscoveredSource {
  title: string;
  url: string;
  snippet: string;
  score: number;
  publishedDate?: string;
  domain?: string;
  rawContent?: string;
  metadata?: {
    pdfUrl?: string;
    doi?: string;
    citationCount?: number;
    sourceApi?: "arxiv" | "semantic_scholar" | "pubmed";
  };
}

// ============================================================
// XML helpers (lightweight, no extra deps)
// ============================================================

function extractTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(regex);
  return match?.[1]?.trim();
}

function extractAllTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const matches: string[] = [];
  let m;
  while ((m = regex.exec(xml)) !== null) {
    matches.push(m[1].trim());
  }
  return matches;
}

function stripXmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ============================================================
// arXiv
// ============================================================

async function searchArxiv(
  query: string,
  maxResults: number,
  logger: ReturnType<typeof createServiceLogger>
): Promise<AcademicPaper[]> {
  const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)" },
    });
    if (!response.ok) {
      throw createExternalServiceErrorFromResponse("arxiv", response.status, "/api/query", await response.text());
    }

    const xml = await response.text();
    const entries = extractAllTags(xml, "entry");

    return entries.map((entryXml) => {
      const title = stripXmlTags(extractTag(entryXml, "title") || "Untitled");
      const summary = stripXmlTags(extractTag(entryXml, "summary") || "");
      const published = extractTag(entryXml, "published") || "";
      const year = published ? new Date(published).getFullYear() : undefined;

      // Extract authors
      const authorXmls = extractAllTags(entryXml, "author");
      const authors = authorXmls
        .map((a) => extractTag(a, "name"))
        .filter(Boolean) as string[];

      // Extract PDF link
      const linkMatches = entryXml.match(/<link[^>]*href="([^"]*)"[^>]*\/>/g) || [];
      let pdfUrl: string | undefined;
      let articleUrl: string | undefined;
      for (const link of linkMatches) {
        const hrefMatch = link.match(/href="([^"]*)"/);
        const typeMatch = link.match(/type="([^"]*)"/);
        const titleMatch = link.match(/title="([^"]*)"/);
        if (hrefMatch) {
          if (typeMatch?.[1] === "application/pdf" || titleMatch?.[1] === "pdf") {
            pdfUrl = hrefMatch[1];
          } else if (!articleUrl && typeMatch?.[1] === "text/html") {
            articleUrl = hrefMatch[1];
          }
        }
      }

      const url = articleUrl || pdfUrl || `https://arxiv.org/abs/${extractTag(entryXml, "id") || ""}`;

      return {
        title,
        authors,
        year,
        abstract: summary,
        url,
        pdfUrl,
        source: "arxiv" as const,
      };
    });
  } catch (error) {
    logger.warn("arXiv search failed", { message: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

// ============================================================
// Semantic Scholar
// ============================================================

async function searchSemanticScholar(
  query: string,
  maxResults: number,
  logger: ReturnType<typeof createServiceLogger>
): Promise<AcademicPaper[]> {
  const apiKey = env.SEMANTIC_SCHOLAR_API_KEY;
  const headers: Record<string, string> = {
    "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=title,authors,year,abstract,openAccessPdf,citationCount,externalIds,url&limit=${maxResults}`;

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw createExternalServiceErrorFromResponse("semantic_scholar", response.status, "/paper/search", await response.text());
    }

    const data = (await response.json()) as {
      data?: Array<{
        title?: string;
        authors?: Array<{ name?: string }>;
        year?: number;
        abstract?: string;
        url?: string;
        openAccessPdf?: { url?: string } | null;
        citationCount?: number;
        externalIds?: { DOI?: string };
      }>;
    };

    return (data.data || []).map((paper) => ({
      title: paper.title || "Untitled",
      authors: (paper.authors || []).map((a) => a.name || "").filter(Boolean),
      year: paper.year,
      abstract: paper.abstract || "",
      url: paper.url || "",
      pdfUrl: paper.openAccessPdf?.url || undefined,
      source: "semantic_scholar" as const,
      citationCount: paper.citationCount,
      doi: paper.externalIds?.DOI,
    }));
  } catch (error) {
    logger.warn("Semantic Scholar search failed", { message: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

// ============================================================
// PubMed
// ============================================================

async function searchPubMed(
  query: string,
  maxResults: number,
  logger: ReturnType<typeof createServiceLogger>
): Promise<AcademicPaper[]> {
  const email = env.PUBMED_EMAIL;
  const baseParams = email ? `&email=${encodeURIComponent(email)}` : "";

  try {
    // Step 1: Search for PMC IDs
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=${encodeURIComponent(query)}&retmax=${maxResults}&sort=relevance${baseParams}`;
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      throw createExternalServiceErrorFromResponse("pubmed", searchResponse.status, "/esearch", await searchResponse.text());
    }
    const searchXml = await searchResponse.text();
    const ids = extractAllTags(searchXml, "Id");

    if (ids.length === 0) return [];

    // Step 2: Fetch metadata for IDs
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${ids.join(",")}&rettype=xml${baseParams}`;
    const fetchResponse = await fetch(fetchUrl);
    if (!fetchResponse.ok) {
      throw createExternalServiceErrorFromResponse("pubmed", fetchResponse.status, "/efetch", await fetchResponse.text());
    }
    const fetchXml = await fetchResponse.text();

    // Parse articles from pmc-articleset
    const articles = extractAllTags(fetchXml, "article");

    return articles.map((articleXml) => {
      const front = extractTag(articleXml, "front") || "";
      const meta = extractTag(front, "article-meta") || "";

      const titleGroup = extractTag(meta, "title-group") || "";
      const title = stripXmlTags(extractTag(titleGroup, "article-title") || "Untitled");

      const abstractTag = extractTag(meta, "abstract") || "";
      const abstract = stripXmlTags(extractTag(abstractTag, "p") || "");

      // Authors
      const contribGroup = extractTag(meta, "contrib-group") || "";
      const nameTags = extractAllTags(contribGroup, "name");
      const authors = nameTags.map((nameXml) => {
        const surname = extractTag(nameXml, "surname") || "";
        const given = extractTag(nameXml, "given-names") || "";
        return `${given} ${surname}`.trim();
      }).filter(Boolean);

      // Year from pub-date
      const pubDate = extractTag(meta, "pub-date") || "";
      const yearStr = extractTag(pubDate, "year");
      const year = yearStr ? parseInt(yearStr, 10) : undefined;

      // DOI
      const articleIdTags = extractAllTags(meta, "article-id");
      let doi: string | undefined;
      for (const idXml of articleIdTags) {
        if (idXml.includes('pub-id-type="doi"')) {
          doi = stripXmlTags(idXml);
          break;
        }
      }

      // PMC ID for URL and PDF
      const pmcId = ids[articles.indexOf(articleXml)];
      const url = `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${pmcId}/`;
      const pdfUrl = `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${pmcId}/pdf/`;

      return {
        title,
        authors,
        year,
        abstract,
        url,
        pdfUrl,
        source: "pubmed" as const,
        doi,
      };
    });
  } catch (error) {
    logger.warn("PubMed search failed", { message: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

// ============================================================
// Internal Action (makes actual API calls)
// ============================================================

export const searchInternal = internalAction({
  args: {
    query: v.string(),
    maxResults: v.number(),
    publicationYearFrom: v.optional(v.number()),
    publicationYearTo: v.optional(v.number()),
    minCitations: v.optional(v.number()),
    openAccessOnly: v.optional(v.boolean()),
    sortBy: v.optional(v.string()),
  },
  handler: async (
    _,
    {
      query,
      maxResults,
      publicationYearFrom,
      publicationYearTo,
      minCitations,
      openAccessOnly,
      sortBy,
    }
  ) => {
    const logger = createServiceLogger("academic_search", "searchInternal");
    const startTime = Date.now();

    logger.operationStart({
      queryLen: query.length,
      maxResults,
      sortBy: sortBy || "relevance",
    });

    // Rate-limit: 200ms between parallel calls
    const arxivPromise = searchArxiv(query, maxResults, logger);
    await sleepMs(200);
    const ssPromise = searchSemanticScholar(query, maxResults, logger);
    await sleepMs(200);
    const pubmedPromise = searchPubMed(query, maxResults, logger);

    const [arxivPapers, ssPapers, pubmedPapers] = await Promise.all([
      arxivPromise,
      ssPromise,
      pubmedPromise,
    ]);

    let allPapers = [...arxivPapers, ...ssPapers, ...pubmedPapers];

    // Deduplicate by DOI or normalized title
    const seen = new Set<string>();
    allPapers = allPapers.filter((paper) => {
      const key = paper.doi || normalizeTitle(paper.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Filter
    if (publicationYearFrom !== undefined) {
      allPapers = allPapers.filter((p) => p.year === undefined || p.year >= publicationYearFrom);
    }
    if (publicationYearTo !== undefined) {
      allPapers = allPapers.filter((p) => p.year === undefined || p.year <= publicationYearTo);
    }
    if (minCitations !== undefined) {
      allPapers = allPapers.filter((p) => (p.citationCount ?? 0) >= minCitations);
    }
    if (openAccessOnly) {
      allPapers = allPapers.filter((p) => !!p.pdfUrl);
    }

    // Sort
    if (sortBy === "citations") {
      allPapers.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
    } else {
      // Relevance: mix of citation count and recency
      allPapers.sort((a, b) => {
        const aScore = (a.citationCount ?? 0) * 0.01 + (a.year ?? 2000) * 0.001;
        const bScore = (b.citationCount ?? 0) * 0.01 + (b.year ?? 2000) * 0.001;
        return bScore - aScore;
      });
    }

    logger.operationComplete({ count: allPapers.length, durationMs: Date.now() - startTime });
    return allPapers;
  },
});

// ============================================================
// Cached Wrapper
// ============================================================

const searchCache = createCachedAction(
  internal._services.search.AcademicSearchService.searchInternal,
  { ttl: withJitter(CACHE_TTL.search * 24, 0.15), name: "academic-search" }
);

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

// ============================================================
// Public Cached Action
// ============================================================

export const discoverAcademicPapersInternal = internalAction({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
    publicationYearFrom: v.optional(v.number()),
    publicationYearTo: v.optional(v.number()),
    minCitations: v.optional(v.number()),
    openAccessOnly: v.optional(v.boolean()),
    sortBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const logger = createServiceLogger("academic_search", "discoverAcademicPapersInternal");
    const startTime = Date.now();
    const normalizedQuery = normalizeQuery(args.query);

    logger.operationStart({
      queryPreview: normalizedQuery.substring(0, 50),
      publicationYearFrom: args.publicationYearFrom ?? null,
      publicationYearTo: args.publicationYearTo ?? null,
      minCitations: args.minCitations ?? null,
    });

    try {
      const papers = await searchCache.fetch(ctx, {
        query: normalizedQuery,
        maxResults: args.maxResults ?? 20,
        publicationYearFrom: args.publicationYearFrom,
        publicationYearTo: args.publicationYearTo,
        minCitations: args.minCitations,
        openAccessOnly: args.openAccessOnly,
        sortBy: args.sortBy ?? "relevance",
      });

      // Transform AcademicPaper[] → DiscoveredSource[]
      const sources: DiscoveredSource[] = papers.map((paper: AcademicPaper) => ({
        title: paper.title,
        url: paper.url,
        snippet: paper.abstract.substring(0, 500),
        score: ((paper.citationCount ?? 0) * 0.001) + ((paper.year ?? 2000) * 0.0001),
        publishedDate: paper.year ? String(paper.year) : undefined,
        rawContent: paper.abstract,
        metadata: {
          pdfUrl: paper.pdfUrl,
          doi: paper.doi,
          citationCount: paper.citationCount,
          sourceApi: paper.source,
        },
      }));

      logger.operationComplete({
        count: sources.length,
        durationMs: Date.now() - startTime,
      });
      return sources;
    } catch (error) {
      logger.operationError(error);
      throw error;
    }
  },
});
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck:convex
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/_services/search/AcademicSearchService.ts
git commit -m "feat: add AcademicSearchService with arXiv, Semantic Scholar, PubMed"
```

---

## Task 4: Create WebLoaderService

**Files:**
- Create: `convex/_services/extraction/WebLoaderService.ts`

- [ ] **Step 1: Write `WebLoaderService.ts`**

```typescript
"use node";
import { Supadata, SupadataError } from "@supadata/js";
import FirecrawlApp from "@mendable/firecrawl-js";
import { env } from "../../_lib/env";
import { validateUrl } from "../../_lib/utils/urlValidation.js";
import { invokeWithRetry } from "../../_agents/_shared/retry.js";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";

export interface WebPageMeta {
  title: string;
  content: string;
  url: string;
}

export interface TranscriptMeta {
  title: string;
  content: string;
}

export class WebLoaderService {
  private supadata: Supadata;
  private firecrawl: FirecrawlApp;

  constructor() {
    this.supadata = new Supadata({
      apiKey: env.SUPADATA_API_KEY,
    });
    this.firecrawl = new FirecrawlApp({ apiKey: env.FIRECRAWL_API_KEY });
  }

  // ============================================================
  // Content cleaning (ported from SupadataLoaderService)
  // ============================================================

  private stripMedia(text: string): string {
    return (
      text
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
        .replace(/!\[([^\]]*)\]\[[^\]]+\]/g, "")
        .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, "")
        .replace(/<img[^>]*>/gi, "")
        .replace(/<img[^>]*\/>/gi, "")
        .replace(/<video[^>]*>.*?<\/video>/gis, "")
        .replace(/<audio[^>]*>.*?<\/audio>/gis, "")
        .replace(/<picture[^>]*>.*?<\/picture>/gis, "")
        .replace(/<source[^>]*>/gi, "")
        .replace(/<source[^>]*\/>/gi, "")
        .replace(/<figure[^>]*>(.*?)<\/figure>/gis, (_, content) => {
          const figcaption = content.match(/<figcaption[^>]*>(.*?)<\/figcaption>/is);
          return figcaption ? figcaption[1].trim() : "";
        })
        .replace(/<iframe[^>]*>.*?<\/iframe>/gis, "")
        .replace(/<embed[^>]*>/gi, "")
        .replace(/<embed[^>]*\/>/gi, "")
        .replace(/<object[^>]*>.*?<\/object>/gis, "")
        .replace(/<svg[^>]*>.*?<\/svg>/gis, "")
        .replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, "")
        .replace(/data:video\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, "")
        .replace(/data:audio\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, "")
        .replace(
          /\[([^\]]*)\]\([^)]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg|pdf)[^)]*\)/gi,
          ""
        )
        .replace(
          /\[?https?:\/\/[^\s\]]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)(\?[^\]\s]*)?\]?/gi,
          ""
        )
        .replace(
          /https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg|pdf)(\?[^\s]*)?\b/gi,
          ""
        )
        .replace(/\b\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg)\b/gi, "")
        .replace(/[^\s]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg)\b/gi, "")
        .replace(/\n\s*\n\s*\n+/g, "\n\n")
        .replace(/^\s+|\s+$/g, "")
        .trim()
    );
  }

  private stripCookieConsentNoise(text: string): string {
    const t = text.replace(
      /\s*We collect and process your personal information[\s\S]{0,4500}?(?:That['']s ok|Accept all(?: cookies)?|Decline\s*That['']s ok)\s*/gi,
      "\n"
    );
    return t.replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  }

  // ============================================================
  // Firecrawl-backed web methods
  // ============================================================

  async loadWebPage(url: string): Promise<string> {
    const { content } = await this.loadWebPageWithMeta(url);
    return content;
  }

  async loadWebPageWithMeta(url: string): Promise<WebPageMeta> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    const logger = createServiceLogger("web_loader", "loadWebPageWithMeta");
    logger.operationStart({ url: url.slice(0, 80) });

    try {
      const result = await this.firecrawl.scrape(url, {
        formats: ["markdown"],
        proxy: "auto",
        parsers: [],
      });

      const data = result as {
        data?: {
          title?: string;
          markdown?: string;
          content?: string;
        };
      };

      const text = data.data?.markdown || data.data?.content || "";
      const title = data.data?.title || "";
      const cleanedText = this.stripCookieConsentNoise(this.stripMedia(text));

      logger.operationComplete({
        rawChars: text.length,
        cleanedChars: cleanedText.length,
      });

      return { title, content: cleanedText, url };
    } catch (error) {
      logger.operationError(error);
      throw error;
    }
  }

  async startCrawl(url: string, limit = 10): Promise<{ jobId: string }> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    const logger = createServiceLogger("web_loader", "startCrawl");
    logger.operationStart({ url: url.slice(0, 80), limit });

    try {
      const result = await this.firecrawl.crawl(url, {
        limit,
        scrapeOptions: {
          formats: ["markdown"],
          proxy: "auto",
        },
      });

      const data = result as { jobId?: string };
      const jobId = data.jobId;
      if (!jobId) {
        throw new Error("Crawl did not return a jobId");
      }

      logger.operationComplete({ jobId });
      return { jobId };
    } catch (error) {
      logger.operationError(error);
      throw error;
    }
  }

  async checkCrawlStatus(jobId: string): Promise<{
    status: string;
    pages?: Array<{ url: string; content: string }>;
  }> {
    const logger = createServiceLogger("web_loader", "checkCrawlStatus");
    logger.operationStart({ jobId });

    try {
      const result = await this.firecrawl.checkCrawlStatus(jobId);
      const data = result as {
        status?: string;
        data?: Array<{ url?: string; markdown?: string; content?: string }>;
      };

      const status = data.status || "unknown";
      const pages = (data.data || []).map((p) => ({
        url: p.url || "",
        content: p.markdown || p.content || "",
      }));

      logger.operationComplete({ status, pageCount: pages.length });
      return { status, pages };
    } catch (error) {
      logger.operationError(error);
      throw error;
    }
  }

  async mapWebsite(url: string): Promise<{ urls: string[] }> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    const logger = createServiceLogger("web_loader", "mapWebsite");
    logger.operationStart({ url: url.slice(0, 80) });

    try {
      const result = await this.firecrawl.map(url);
      const data = result as { links?: string[] };
      const urls = data.links || [];
      logger.operationComplete({ urlCount: urls.length });
      return { urls };
    } catch (error) {
      logger.operationError(error);
      throw error;
    }
  }

  // ============================================================
  // Supadata-backed social transcript methods
  // ============================================================

  async loadSocialTranscript(url: string, lang = "en"): Promise<string> {
    const { content } = await this.loadSocialTranscriptWithMeta(url, lang);
    return content;
  }

  async loadSocialTranscriptWithMeta(
    url: string,
    lang = "en"
  ): Promise<TranscriptMeta> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    const logger = createServiceLogger("supadata", "loadSocialTranscriptWithMeta");

    return invokeWithRetry(
      () => this.loadSocialTranscriptWithMetaInternal(url, lang),
      {
        maxAttempts: 5,
        baseDelayMs: 2000,
        jitter: true,
        retryableErrors: (err) =>
          /limit exceeded|rate limit|too many requests|429/i.test(err.message),
        onRetry: (attempt, error, delayMs) =>
          logger.warn("Rate limited, retrying transcript with meta", {
            attempt,
            delayMs,
            message: error.message,
          }),
      },
      "loadSocialTranscriptWithMeta"
    );
  }

  private async loadSocialTranscriptWithMetaInternal(
    url: string,
    lang: string
  ): Promise<TranscriptMeta> {
    const logger = createServiceLogger("supadata", "transcriptInternal");
    const transcriptResult = await this.supadata.transcript({
      url,
      lang,
      text: true,
      mode: "auto",
    });

    if ("jobId" in transcriptResult) {
      logger.info("Started async transcript job", {
        jobId: (transcriptResult as { jobId: string }).jobId,
      });
      return this.pollForTranscriptWithMeta((transcriptResult as { jobId: string }).jobId);
    }

    const result = transcriptResult as string | { content?: string; title?: string };
    const title =
      typeof result === "object" && result && "title" in result ? (result.title ?? "") : "";
    const text =
      typeof result === "string" ? result : (result?.content ?? JSON.stringify(result ?? ""));
    logger.operationComplete({ charCount: text.length });
    return { title, content: this.stripMedia(text) };
  }

  private async pollForTranscriptWithMeta(
    jobId: string,
    maxAttempts = 30
  ): Promise<TranscriptMeta> {
    const logger = createServiceLogger("supadata", "pollTranscript");
    logger.operationStart({ jobId, maxAttempts });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const jobResult = await this.supadata.transcript.getJobStatus(jobId);

      if (jobResult.status === "completed") {
        const result = jobResult.result as { content?: string; title?: string } | undefined;
        const content = result?.content;
        const title = (result as { title?: string } | undefined)?.title ?? "";
        const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
        logger.operationComplete({ charCount: text.length, jobId });
        return { title, content: this.stripMedia(text) };
      } else if (jobResult.status === "failed") {
        throw new Error(
          `Transcript job failed: ${(jobResult as { error?: { message?: string } }).error?.message || "Unknown error"}`
        );
      }

      logger.debug("Transcript job pending", {
        status: jobResult.status,
        attempt,
        maxAttempts,
        jobId,
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error(`Transcript job timed out after ${maxAttempts} attempts`);
  }

  isSocialPlatform(url: string): boolean {
    const supportedDomains = [
      "youtube.com",
      "youtu.be",
      "tiktok.com",
      "instagram.com",
      "twitter.com",
      "x.com",
    ];
    return supportedDomains.some((domain) => url.includes(domain));
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck:convex
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/_services/extraction/WebLoaderService.ts
git commit -m "feat: add WebLoaderService with Firecrawl web + Supadata social transcripts"
```

---

## Task 5: Create AcademicLoaderService

**Files:**
- Create: `convex/_services/extraction/AcademicLoaderService.ts`

- [ ] **Step 1: Write `AcademicLoaderService.ts`**

```typescript
"use node";

import { MistralOCRService } from "./MistralOCRService";
import { WebLoaderService } from "./WebLoaderService";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { env } from "../../_lib/env";

export interface AcademicPaper {
  title: string;
  authors: string[];
  year?: number;
  abstract: string;
  url: string;
  pdfUrl?: string;
  source: "arxiv" | "semantic_scholar" | "pubmed";
  citationCount?: number;
  doi?: string;
}

export class AcademicLoaderService {
  private mistralOCR: MistralOCRService;
  private webLoader: WebLoaderService;

  constructor() {
    this.mistralOCR = new MistralOCRService(env.MISTRAL_API_KEY);
    this.webLoader = new WebLoaderService();
  }

  async loadPaper(paper: AcademicPaper): Promise<{ title: string; content: string; source: string }> {
    const logger = createServiceLogger("academic_loader", "loadPaper");
    logger.operationStart({
      title: paper.title.slice(0, 60),
      hasPdfUrl: !!paper.pdfUrl,
      hasUrl: !!paper.url,
    });

    // 1. Try PDF OCR
    if (paper.pdfUrl) {
      try {
        const text = await this.mistralOCR.processDocument(paper.pdfUrl);
        if (text?.trim()) {
          logger.operationComplete({ method: "pdf_ocr", charCount: text.length });
          return { title: paper.title, content: text, source: paper.source };
        }
      } catch (error) {
        logger.warn("PDF OCR failed", { message: error instanceof Error ? error.message : String(error) });
      }
    }

    // 2. Try scraping the landing page / abstract URL
    if (paper.url) {
      try {
        const meta = await this.webLoader.loadWebPageWithMeta(paper.url);
        if (meta.content?.trim()) {
          logger.operationComplete({ method: "web_scrape", charCount: meta.content.length });
          return { title: meta.title || paper.title, content: meta.content, source: paper.source };
        }
      } catch (error) {
        logger.warn("Web scrape fallback failed", { message: error instanceof Error ? error.message : String(error) });
      }
    }

    // 3. Fallback to structured markdown from metadata
    const lines = [
      `# ${paper.title}`,
      "",
      `**Authors:** ${paper.authors.join(", ") || "Unknown"}`,
    ];
    if (paper.year) lines.push(`**Year:** ${paper.year}`);
    if (paper.doi) lines.push(`**DOI:** ${paper.doi}`);
    if (paper.citationCount !== undefined) lines.push(`**Citations:** ${paper.citationCount}`);
    lines.push("");
    lines.push("## Abstract");
    lines.push(paper.abstract || "No abstract available.");

    const content = lines.join("\n");
    logger.operationComplete({ method: "metadata_stub", charCount: content.length });
    return { title: paper.title, content, source: paper.source };
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck:convex
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/_services/extraction/AcademicLoaderService.ts
git commit -m "feat: add AcademicLoaderService for PDF OCR and abstract fallback"
```

---

## Task 6: Update DiscoveryService

**Files:**
- Modify: `convex/_services/search/DiscoveryService.ts`

- [ ] **Step 1: Update imports and transform functions**

Replace the Tavily and OpenAlex imports and transforms in `DiscoveryService.ts`:

**Old imports (around lines 1-8):**
```typescript
"use node";

import { getAuthUserId } from "../../auth";
import { action } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
```

**Update the comment on line 11:**
Change `"Normalizes results from different APIs (Tavily, OpenAlex)"` to `"Normalizes results from different APIs (Firecrawl, Academic APIs)"`.

**Replace `transformTavilyResult` (lines 84-101) with `transformWebResult`:**
```typescript
/**
 * Transform web search result to unified format
 */
function transformWebResult(
  result: any,
  sourceType: "web" | "news" | "finance"
): UnifiedDiscoveryResult {
  return {
    id: `web-${sourceType}-${result.url}`,
    title: result.title,
    url: result.url,
    snippet: result.snippet,
    score: normalizeScore(result.score, sourceType),
    sourceType,
    publishedDate: result.publishedDate,
    metadata: {
      domain: result.domain,
      relevanceLabel: getRelevanceLabel(result.score),
    },
  };
}
```

**Replace `transformOpenAlexResult` (lines 104-130) with `transformAcademicResult`:**
```typescript
/**
 * Transform academic search result to unified format
 */
function transformAcademicResult(result: any): UnifiedDiscoveryResult {
  return {
    id: `academic-${result.metadata?.sourceApi || "unknown"}-${result.url}`,
    title: result.title,
    url: result.url,
    snippet: result.snippet,
    score: normalizeScore(result.score, "academic"),
    sourceType: "academic",
    publishedDate: result.publishedDate,
    metadata: {
      authors: result.metadata?.authors,
      citationCount: result.metadata?.citationCount,
      openAccess: !!result.metadata?.pdfUrl,
      hasFullText: !!result.metadata?.pdfUrl,
      publicationYear: result.publishedDate ? parseInt(result.publishedDate, 10) : undefined,
      type: "article",
      doi: result.metadata?.doi,
      pdfUrl: result.metadata?.pdfUrl,
      landingPageUrl: result.url,
    },
  };
}
```

- [ ] **Step 2: Update the discover action handler**

**Replace the Tavily search loop (around lines 261-301):**

Old code:
```typescript
    // For each Tavily topic, create a search promise with timing
    for (const topic of tavilyTopics) {
      const tavilyTopic = topic === "web" ? "general" : topic;
      const topicStartTime = Date.now();

      const promise = (ctx.runAction as any)(
        internal._services.search.TavilySearchService.discoverSourcesInternal,
        {
          query,
          maxResults: maxPerChannel,
          topic: tavilyTopic,
          timeRange: timeRange as any,
          searchDepth: "basic",
        }
      )
        .then((results: any) => {
          ...
          return {
            sourceType: topic,
            results: results.map((r: any) => transformTavilyResult(r, topic)),
            duration,
          };
        })
        .catch((error: Error) => {
          ...
          return {
            sourceType: topic,
            results: [],
            duration,
          };
        });

      searchPromises.push(promise);
    }
```

New code:
```typescript
    // For each web topic, create a search promise with timing
    for (const topic of tavilyTopics) {
      const firecrawlTopic = topic === "web" ? "general" : topic;
      const topicStartTime = Date.now();

      const promise = (ctx.runAction as any)(
        internal._services.search.FirecrawlSearchService.discoverSourcesInternal,
        {
          query,
          maxResults: maxPerChannel,
          topic: firecrawlTopic,
          timeRange: timeRange as any,
          searchDepth: "basic",
        }
      )
        .then((results: any) => {
          const duration = Date.now() - topicStartTime;
          logger.info(`${topic.toUpperCase()} search completed`, {
            durationMs: duration,
            resultCount: results.length,
          });
          return {
            sourceType: topic,
            results: results.map((r: any) => transformWebResult(r, topic)),
            duration,
          };
        })
        .catch((error: Error) => {
          const duration = Date.now() - topicStartTime;
          logger.warn(`${topic.toUpperCase()} search failed`, {
            durationMs: duration,
            message: error.message,
          });
          return {
            sourceType: topic,
            results: [],
            duration,
          };
        });

      searchPromises.push(promise);
    }
```

**Replace the OpenAlex academic search block (around lines 304-346):**

Old code:
```typescript
    // OpenAlex search (academic) with timing
    if (searchAcademic) {
      const academicStartTime = Date.now();

      const promise = (ctx.runAction as any)(
        internal._services.search.OpenAlexSearchService.discoverAcademicPapersInternal,
        {
          query,
          maxResults: maxPerChannel,
          publicationYearFrom: academicFilters?.publicationYearFrom,
          publicationYearTo: academicFilters?.publicationYearTo,
          minCitations: academicFilters?.minCitations,
          openAccessOnly: academicFilters?.openAccessOnly,
          hasFullText: academicFilters?.hasFullText,
          sortBy: sortBy as any,
        }
      )
        .then((results: any) => {
          ...
          return {
            sourceType: "academic",
            results: results.map((r: any) => transformOpenAlexResult(r)),
            duration,
          };
        })
        .catch((error: Error) => {
          ...
          return {
            sourceType: "academic",
            results: [],
            duration,
          };
        });

      searchPromises.push(promise);
    }
```

New code:
```typescript
    // Academic search with timing
    if (searchAcademic) {
      const academicStartTime = Date.now();

      const promise = (ctx.runAction as any)(
        internal._services.search.AcademicSearchService.discoverAcademicPapersInternal,
        {
          query,
          maxResults: maxPerChannel,
          publicationYearFrom: academicFilters?.publicationYearFrom,
          publicationYearTo: academicFilters?.publicationYearTo,
          minCitations: academicFilters?.minCitations,
          openAccessOnly: academicFilters?.openAccessOnly,
          sortBy: sortBy as any,
        }
      )
        .then((results: any) => {
          const duration = Date.now() - academicStartTime;
          logger.info("ACADEMIC search completed", {
            durationMs: duration,
            resultCount: results.length,
          });
          return {
            sourceType: "academic",
            results: results.map((r: any) => transformAcademicResult(r)),
            duration,
          };
        })
        .catch((error: Error) => {
          const duration = Date.now() - academicStartTime;
          logger.warn("ACADEMIC search failed", {
            durationMs: duration,
            message: error.message,
          });
          return {
            sourceType: "academic",
            results: [],
            duration,
          };
        });

      searchPromises.push(promise);
    }
```

**Update the `discoverSources` action (around lines 395-421):**

Replace:
```typescript
    const result = await (ctx.runAction as any)(
      internal._services.search.TavilySearchService.discoverSourcesInternal,
      {
        query: args.query,
        maxResults: args.maxResults ?? 10,
      }
    );
```

With:
```typescript
    const result = await (ctx.runAction as any)(
      internal._services.search.FirecrawlSearchService.discoverSourcesInternal,
      {
        query: args.query,
        maxResults: args.maxResults ?? 10,
      }
    );
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck:convex
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/_services/search/DiscoveryService.ts
git commit -m "refactor: wire FirecrawlSearchService and AcademicSearchService into DiscoveryService"
```

---

## Task 7: Update chat/stream.ts

**Files:**
- Modify: `convex/chat/stream.ts`

- [ ] **Step 1: Replace Tavily call with Firecrawl**

Find the Tavily search call around line 771 in `stream.ts`. Replace:

```typescript
          ctx.runAction(internal._services.search.TavilySearchService.discoverSourcesInternal, {
```

With:
```typescript
          ctx.runAction(internal._services.search.FirecrawlSearchService.discoverSourcesInternal, {
```

Also update the error log message around line 785 from:
```typescript
            chatStreamLog.warn("tavily_search_failed", { channel, topic, error: String(e) });
```

To:
```typescript
            chatStreamLog.warn("web_search_failed", { channel, topic, error: String(e) });
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck:convex
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/chat/stream.ts
git commit -m "refactor: replace Tavily with Firecrawl in chat stream"
```

---

## Task 8: Update documents/embeddingJob.ts

**Files:**
- Modify: `convex/documents/embeddingJob.ts`

- [ ] **Step 1: Update imports**

Replace:
```typescript
import { SupadataLoaderService } from "../_services/extraction/SupadataLoaderService";
```

With:
```typescript
import { WebLoaderService } from "../_services/extraction/WebLoaderService";
import { AcademicLoaderService } from "../_services/extraction/AcademicLoaderService";
```

Remove:
```typescript
import { resolveOpenAlexSourceUrlToArticleUrl } from "../_lib/resolveOpenAlexSourceUrl";
```

- [ ] **Step 2: Update loader initialization and usage**

In the `handler`, replace:
```typescript
      const mistralOCR = new MistralOCRService(process.env.MISTRAL_API_KEY || "");
      const supadataLoader = new SupadataLoaderService();
```

With:
```typescript
      const mistralOCR = new MistralOCRService(process.env.MISTRAL_API_KEY || "");
      const webLoader = new WebLoaderService();
      const academicLoader = new AcademicLoaderService();
```

Replace the YouTube extraction block (around lines 141-149):
```typescript
      if (docDetails.fileType === "youtube") {
        logger.info("Extracting YouTube transcript");
        const meta = await supadataLoader.loadTranscriptWithMeta(docDetails.fileUrl || "");
```

With:
```typescript
      if (docDetails.fileType === "youtube") {
        logger.info("Extracting YouTube transcript");
        const meta = await webLoader.loadSocialTranscriptWithMeta(docDetails.fileUrl || "");
```

Replace the URL scraping block (around lines 228-249):

Old:
```typescript
      } else if (docDetails.fileType === "url") {
        logger.info("Extracting web page content");
        const rawUrl = docDetails.fileUrl || "";
        const scrapeUrl = await resolveOpenAlexSourceUrlToArticleUrl(rawUrl);
        if (scrapeUrl !== rawUrl) {
          logger.info("Resolved OpenAlex work URL to article URL for scraping", {
            from: rawUrl,
            to: scrapeUrl,
          });
          await ctx.runMutation(internal.documents.index.setDocumentFileUrl, {
            documentId,
            fileUrl: scrapeUrl,
          });
        }
        effectiveFileUrl = scrapeUrl;
        const meta = await supadataLoader.loadWebPageWithMeta(scrapeUrl);
```

New:
```typescript
      } else if (docDetails.fileType === "url") {
        logger.info("Extracting web page content");
        const rawUrl = docDetails.fileUrl || "";
        effectiveFileUrl = rawUrl;
        const meta = await webLoader.loadWebPageWithMeta(rawUrl);
```

Replace the paper_record block (around lines 250-336):

Old:
```typescript
      } else if (docDetails.fileType === "paper_record") {
        logger.info("Processing paper_record (OA PDF → Supadata PDF → repository/landing URLs → metadata stub)");
        const pr = docDetails.paperRecord;
        if (!pr) {
          throw new Error("paper_record document missing paperRecord");
        }
        const pdfUrl = pr.pdfUrl?.trim();
        const landing = pr.landingPageUrl?.trim();
        const primaryDocUrl = docDetails.fileUrl?.trim();
        let paperIngestion: "ingested" | "metadata_only" = "metadata_only";

        if (pdfUrl) {
          try {
            extractedText = await mistralOCR.processDocument(pdfUrl);
            if (extractedText?.trim()) {
              paperIngestion = "ingested";
              logger.phaseComplete("extraction", {
                contentLength: extractedText.length,
                method: "oa_pdf_ocr",
              });
            }
          } catch (e) {
            logger.warn("OA PDF extraction failed", { message: e instanceof Error ? e.message : String(e) });
          }
        }

        // Mistral often fails on institutional PDFs; Supadata may still extract text from the same URL.
        if (!extractedText?.trim() && pdfUrl) {
          try {
            const meta = await supadataLoader.loadWebPageWithMeta(pdfUrl);
            extractedText = meta.content;
            if (meta.title?.trim()) extractedTitle = meta.title.trim();
            if (extractedText?.trim()) {
              paperIngestion = "ingested";
              logger.phaseComplete("extraction", {
                contentLength: extractedText.length,
                title: extractedTitle,
                method: "oa_pdf_scrape",
              });
            }
          } catch (e) {
            logger.warn("Supadata PDF URL failed", {
              message: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // Landing from OpenAlex is sometimes missing even when `fileUrl` (DOI, handle, publisher) is set.
        const scrapeUrls = [...new Set([landing, primaryDocUrl].filter(Boolean) as string[])];
        for (const url of scrapeUrls) {
          if (extractedText?.trim()) break;
          if (url === pdfUrl) continue;
          try {
            const meta = await supadataLoader.loadWebPageWithMeta(url);
            extractedText = meta.content;
            if (meta.title?.trim()) extractedTitle = meta.title.trim();
            if (extractedText?.trim()) {
              paperIngestion = "ingested";
              logger.phaseComplete("extraction", {
                contentLength: extractedText.length,
                title: extractedTitle,
                method: "repository_or_landing_scrape",
              });
              break;
            }
          } catch (e) {
            logger.warn("Scrape failed for paper URL", {
              url: url.slice(0, 80),
              message: e instanceof Error ? e.message : String(e),
            });
          }
        }

        if (!extractedText?.trim()) {
          extractedText = buildPaperMetadataMarkdown(pr, docDetails.fileName || "Research paper");
          paperIngestion = "metadata_only";
          logger.phaseComplete("extraction", {
            contentLength: extractedText.length,
            method: "metadata_stub",
          });
        }

        await ctx.runMutation(internal.documents.index.patch, {
          documentId,
          patch: { ingestionStatus: paperIngestion },
        });
      }
```

New:
```typescript
      } else if (docDetails.fileType === "paper_record") {
        logger.info("Processing paper_record (OA PDF → Mistral OCR → web scrape fallback → metadata stub)");
        const pr = docDetails.paperRecord;
        if (!pr) {
          throw new Error("paper_record document missing paperRecord");
        }
        let paperIngestion: "ingested" | "metadata_only" = "metadata_only";

        const paper = {
          title: pr.title || docDetails.fileName || "Research paper",
          authors: pr.authors || [],
          year: pr.publicationYear,
          abstract: pr.snippet || "",
          url: docDetails.fileUrl || pr.landingPageUrl || "",
          pdfUrl: pr.pdfUrl,
          source: pr.sourceApi || "semantic_scholar",
          citationCount: pr.citationCount,
          doi: pr.doi,
        };

        try {
          const result = await academicLoader.loadPaper(paper);
          extractedText = result.content;
          if (result.title?.trim()) extractedTitle = result.title.trim();
          if (extractedText?.trim()) {
            paperIngestion = "ingested";
            logger.phaseComplete("extraction", {
              contentLength: extractedText.length,
              title: extractedTitle,
              method: "academic_loader",
            });
          }
        } catch (e) {
          logger.warn("AcademicLoaderService failed", { message: e instanceof Error ? e.message : String(e) });
        }

        if (!extractedText?.trim()) {
          extractedText = buildPaperMetadataMarkdown(pr, docDetails.fileName || "Research paper");
          paperIngestion = "metadata_only";
          logger.phaseComplete("extraction", {
            contentLength: extractedText.length,
            method: "metadata_stub",
          });
        }

        await ctx.runMutation(internal.documents.index.patch, {
          documentId,
          patch: { ingestionStatus: paperIngestion },
        });
      }
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck:convex
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/documents/embeddingJob.ts
git commit -m "refactor: use WebLoaderService and AcademicLoaderService in embedding job"
```

---

## Task 9: Update extractors.ts

**Files:**
- Modify: `convex/_services/extractors.ts`

- [ ] **Step 1: Replace implementations with WebLoaderService**

Replace the entire file contents with:

```typescript
"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "../auth";
import { WebLoaderService } from "./extraction/WebLoaderService";
import {
  markdownFromMistralOcrResponse,
  stripMistralOcrMedia,
} from "./extraction/MistralOCRService";

/**
 * Scrape a URL using Firecrawl
 */
export const scrapeUrl = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<{ title: string; content: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const loader = new WebLoaderService();
    return loader.loadWebPageWithMeta(args.url);
  },
});

/**
 * Get YouTube transcript using Supadata (via WebLoaderService)
 */
export const getYouTubeTranscript = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<{ title: string; content: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const loader = new WebLoaderService();
    return loader.loadSocialTranscriptWithMeta(args.url);
  },
});

/**
 * Extract text from a URL using Firecrawl (legacy alias)
 */
export const extractFromUrl = scrapeUrl;

/**
 * Extract transcript from a YouTube video using Supadata (legacy alias)
 */
export const extractFromYouTube = action({
  args: { videoId: v.string() },
  handler: async (ctx, args): Promise<{ title: string; content: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const loader = new WebLoaderService();
    return loader.loadSocialTranscriptWithMeta(`https://youtube.com/watch?v=${args.videoId}`);
  },
});

/**
 * Extract text from a PDF/image using Mistral OCR API
 */
export const extractFromOCR = action({
  args: { fileUrl: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY is not set");
    }

    const response = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          document_url: args.fileUrl,
        },
        table_format: "markdown",
        include_image_base64: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral OCR API error: ${error}`);
    }

    const data = await response.json();
    return stripMistralOcrMedia(markdownFromMistralOcrResponse(data));
  },
});
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck:convex
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/_services/extractors.ts
git commit -m "refactor: replace extractors with WebLoaderService"
```

---

## Task 10: Delete Old Service Files

**Files:**
- Delete: `convex/_services/search/TavilySearchService.ts`
- Delete: `convex/_services/search/OpenAlexSearchService.ts`
- Delete: `convex/_services/extraction/SupadataLoaderService.ts`
- Delete: `convex/_lib/resolveOpenAlexSourceUrl.ts`

- [ ] **Step 1: Delete old files**

```bash
rm convex/_services/search/TavilySearchService.ts
rm convex/_services/search/OpenAlexSearchService.ts
rm convex/_services/extraction/SupadataLoaderService.ts
rm convex/_lib/resolveOpenAlexSourceUrl.ts
```

- [ ] **Step 2: Regenerate Convex API types**

```bash
npx convex dev --once
```

Or if dev is already running, the types will regenerate automatically. To force:
```bash
npx convex codegen
```

Expected: `_generated/api.d.ts` no longer references deleted files.

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck:convex
```

Expected: no errors (the generated API should now reference only the new services).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete Tavily, OpenAlex, SupadataLoader services and resolveOpenAlexSourceUrl"
```

---

## Task 11: Final Verification

**Files:**
- All modified/created files

- [ ] **Step 1: Run Convex typecheck**

```bash
bun run typecheck:convex
```

Expected: PASS with no errors.

- [ ] **Step 2: Run Web typecheck**

```bash
bun run typecheck:web
```

Expected: PASS with no errors.

- [ ] **Step 3: Run linter**

```bash
bun run lint
```

Expected: PASS with no errors (or auto-fix any style issues with `bun run lint:fix`).

- [ ] **Step 4: Run tests**

```bash
bun run test:convex
```

Expected: All existing tests pass.

- [ ] **Step 5: Commit any auto-fixes**

```bash
git add -A
git commit -m "style: lint fixes" || echo "No lint fixes needed"
```

---

## Manual Smoke Test Plan

After all automated checks pass, verify these flows manually:

1. **Source discovery:**
   - Open a notebook → Add Source → Search web + news
   - Verify results return with titles, URLs, snippets
   - Search academic sources
   - Verify papers from arXiv/Semantic Scholar/PubMed appear

2. **Chat with external channels:**
   - Start a chat → select web/news/finance channels
   - Send a message
   - Verify external sources appear in `__EXTERNAL_SOURCES` stream metadata

3. **Add URL source:**
   - Add Source → URL → paste any article URL
   - Verify embedding completes and chunks are searchable

4. **Add YouTube source:**
   - Add Source → YouTube URL
   - Verify transcript extraction and embedding

5. **Add academic paper:**
   - Find an academic paper through discovery
   - Add it as a source
   - Verify PDF OCR or abstract fallback produces text

---

## Rollback

If anything fails in production: `git revert HEAD~N..HEAD` where N is the number of commits in this plan. No compatibility shims are kept — the old files are fully deleted.

---

## Spec Coverage Checklist

| Spec Requirement | Implementing Task |
|------------------|-------------------|
| Firecrawl `/search` replaces Tavily | Task 2 |
| Firecrawl `/scrape`, `/crawl`, `/map` replaces Supadata web | Task 4 |
| Supadata kept for YouTube/TikTok/Instagram/X | Task 4 (social methods) |
| arXiv + Semantic Scholar + PubMed replace OpenAlex | Task 3 |
| Academic PDF → Mistral OCR; abstract fallback | Task 5 |
| No vendor names in service files | All tasks (FirecrawlSearchService, AcademicSearchService, WebLoaderService, AcademicLoaderService) |
| No frontend changes | No tasks touch frontend |
| No schema changes | No tasks touch schema |
| DiscoveryService call-site updates | Task 6 |
| chat/stream.ts call-site updates | Task 7 |
| embeddingJob.ts call-site updates | Task 8 |
| extractors.ts call-site updates | Task 9 |
| env.ts updates | Task 1 |
| Deleted old services | Task 10 |

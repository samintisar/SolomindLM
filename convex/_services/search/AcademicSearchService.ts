"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { createCachedAction } from "../cache/cachedAgent";
import { CACHE_TTL, withJitter } from "../cache/cache";
import { internal } from "../../_generated/api";
import { env } from "../../_lib/env";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { createExternalServiceErrorFromResponse, ExternalServiceError, isRetryableHttpStatus } from "../../_lib/errors";
import { invokeWithHttpRetry } from "../../_agents/_shared/retry";

/**
 * Academic paper from external APIs (arXiv, Semantic Scholar, PubMed)
 */
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
  score: number;
}

/**
 * Normalized discovery source format for consumers
 */
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
// XML Parsing Helpers (lightweight regex-based)
// ============================================================

export function extractTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = xml.match(regex);
  return match?.[1]?.trim();
}

export function extractAllTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "gi");
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1].trim());
  }
  return matches;
}

export function stripXmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function extractAttribute(xmlFragment: string, attr: string): string | undefined {
  const regex = new RegExp(`${attr}=["']([^"']+)["']`, "i");
  const match = xmlFragment.match(regex);
  return match?.[1];
}

export function extractXmlBlocks(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const blocks: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

// ============================================================
// Utility Helpers
// ============================================================

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

export function calculateScore(paper: Omit<AcademicPaper, "score">): number {
  // Normalize citation score: sigmoid-like scaling so low-citation papers don't get crushed
  const rawCitations = paper.citationCount ?? 0;
  const citationScore = rawCitations > 0 ? Math.min(Math.log10(rawCitations + 1) / 3, 1) : 0.3;
  
  const currentYear = new Date().getFullYear();
  const age = paper.year ? Math.max(0, currentYear - paper.year) : 5;
  // Recency: 1.0 for current year, decaying to 0.5 at 10 years
  const recencyScore = Math.max(0.5, 1 - age * 0.05);
  
  return citationScore * 0.5 + recencyScore * 0.5;
}

export function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export function yearToDateString(year: number | undefined): string | undefined {
  return year ? `${year}-01-01` : undefined;
}

export function toDiscoveredSource(paper: AcademicPaper): DiscoveredSource {
  return {
    title: paper.title,
    url: paper.url,
    snippet: paper.abstract.substring(0, 500),
    score: paper.score,
    publishedDate: yearToDateString(paper.year),
    domain: extractDomain(paper.url),
    rawContent: paper.abstract,
    metadata: {
      pdfUrl: paper.pdfUrl,
      doi: paper.doi,
      citationCount: paper.citationCount,
      sourceApi: paper.source,
    },
  };
}

// ============================================================
// arXiv Search
// ============================================================

async function searchArxiv(
  query: string,
  maxResults: number,
  _filters: {
    publicationYearFrom?: number;
    publicationYearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
  }
): Promise<AcademicPaper[]> {
  const logger = createServiceLogger("academic_search", "searchArxiv");
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;

  return invokeWithHttpRetry(
    async () => {
      const t0 = Date.now();
      logger.apiCall("arxiv", "/api/query", { query: query.substring(0, 50) });

      const response = await fetch(url, {
        headers: {
          "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.apiError("arxiv", "/api/query", new Error(`HTTP ${response.status}`), {
          status: response.status,
        });
        throw createExternalServiceErrorFromResponse(
          "arxiv",
          response.status,
          "/api/query",
          errorText.slice(0, 500)
        );
      }

      const xml = await response.text();
      logger.apiSuccess("arxiv", "/api/query", Date.now() - t0, { maxResults });

      const entries = extractXmlBlocks(xml, "entry");
      const papers: AcademicPaper[] = [];

      for (const entry of entries) {
        const title = stripXmlTags(extractTag(entry, "title") || "Untitled");
        const summary = stripXmlTags(extractTag(entry, "summary") || "");
        const published = extractTag(entry, "published");
        let year = published ? parseInt(published.substring(0, 4), 10) : undefined;
        if (year !== undefined && isNaN(year)) {
          year = undefined;
        }

        // Extract authors from <author><name>...</name></author>
        const authorNames = extractAllTags(entry, "name");

        // Extract links: prefer rel="alternate" for HTML, look for PDF
        let articleUrl = "";
        let pdfUrl: string | undefined;

        const linkRegex = /<link\s+([^>]+)\/>/gi;
        let linkMatch;
        while ((linkMatch = linkRegex.exec(entry)) !== null) {
          const attrs = linkMatch[1];
          const href = extractAttribute(attrs, "href");
          const rel = extractAttribute(attrs, "rel");
          const type = extractAttribute(attrs, "type");
          const linkTitle = extractAttribute(attrs, "title");

          if (href) {
            if (rel === "alternate" && !articleUrl) {
              articleUrl = href;
            }
            if ((type === "application/pdf" || linkTitle === "pdf") && !pdfUrl) {
              pdfUrl = href;
            }
          }
        }

        // Fallback: construct URL from arXiv ID if present
        if (!articleUrl) {
          const idMatch = entry.match(/<id>([^<]+)<\/id>/);
          if (idMatch) {
            articleUrl = idMatch[1].trim();
          }
        }

        // arXiv entries don't have DOI or citation count in the basic API
        const doi = extractTag(entry, "doi") || undefined;

        const basePaper: Omit<AcademicPaper, "score"> = {
          title,
          authors: authorNames,
          year,
          abstract: summary,
          url: articleUrl || `https://arxiv.org/search/?query=${encodeURIComponent(query)}`,
          pdfUrl,
          source: "arxiv",
          citationCount: undefined,
          doi,
        };

        papers.push({ ...basePaper, score: calculateScore(basePaper) });
      }

      return papers;
    },
    "arxiv_search"
  );
}

// ============================================================
// Semantic Scholar Search
// ============================================================

async function searchSemanticScholar(
  query: string,
  maxResults: number,
  _filters: {
    publicationYearFrom?: number;
    publicationYearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
  }
): Promise<AcademicPaper[]> {
  const logger = createServiceLogger("academic_search", "searchSemanticScholar");
  const fields = "title,authors,year,abstract,openAccessPdf,citationCount,externalIds,url";
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=${fields}&limit=${maxResults}`;

  const headers: Record<string, string> = {
    "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
  };
  if (env.SEMANTIC_SCHOLAR_API_KEY) {
    headers["x-api-key"] = env.SEMANTIC_SCHOLAR_API_KEY;
  }

  // Custom retry config for Semantic Scholar rate limits
  const MAX_ATTEMPTS = 5;
  const BASE_DELAY_MS = 2000;

  let lastError: Error | undefined;
  let retryAfterMs: number | undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const t0 = Date.now();
      logger.apiCall("semantic_scholar", "/graph/v1/paper/search", {
        query: query.substring(0, 50),
      });

      const response = await fetch(url, { headers });

      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;

        logger.apiError(
          "semantic_scholar",
          "/graph/v1/paper/search",
          new Error(`HTTP ${status}`),
          { status }
        );

        // Check for Retry-After header on 429
        retryAfterMs = undefined;
        if (status === 429) {
          const retryAfter = response.headers.get("retry-after");
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) {
              retryAfterMs = parsed * 1000;
            }
          }
        }

        throw createExternalServiceErrorFromResponse(
          "semantic_scholar",
          status,
          "/graph/v1/paper/search",
          errorText.slice(0, 500)
        );
      }

      const data = (await response.json()) as {
        data?: Array<{
          paperId?: string;
          title?: string;
          authors?: Array<{ name?: string }>;
          year?: number;
          abstract?: string;
          openAccessPdf?: { url?: string } | null;
          citationCount?: number;
          externalIds?: { DOI?: string; ArXiv?: string };
          url?: string;
        }>;
      };

      logger.apiSuccess("semantic_scholar", "/graph/v1/paper/search", Date.now() - t0, {
        maxResults,
      });

      const papers: AcademicPaper[] = [];
      const items = data.data || [];

      for (const item of items) {
        const title = item.title || "Untitled";
        const authors = (item.authors || []).map((a) => a.name).filter(Boolean) as string[];
        const abstract = item.abstract || "";
        const pdfUrl = item.openAccessPdf?.url || undefined;
        const doi = item.externalIds?.DOI || undefined;
        const url = item.url || `https://www.semanticscholar.org/paper/${item.paperId || ""}`;

        const basePaper: Omit<AcademicPaper, "score"> = {
          title,
          authors,
          year: item.year,
          abstract,
          url,
          pdfUrl,
          source: "semantic_scholar",
          citationCount: item.citationCount,
          doi,
        };

        papers.push({ ...basePaper, score: calculateScore(basePaper) });
      }

      return papers;
    } catch (error) {
      lastError = error as Error;

      const isRetryable =
        lastError instanceof ExternalServiceError
          ? lastError.retryable
          : (() => {
              const m = lastError.message.match(/\bHTTP\s+(\d{3})\b/i);
              if (m) return isRetryableHttpStatus(parseInt(m[1], 10));
              return false;
            })();

      if (!isRetryable || attempt >= MAX_ATTEMPTS - 1) {
        break;
      }

      // Calculate delay: respect Retry-After if present, else exponential backoff with jitter
      let delayMs = retryAfterMs ?? BASE_DELAY_MS * Math.pow(2, attempt);
      // Add ±25% jitter
      const jitterAmount = delayMs * 0.25;
      delayMs = Math.max(0, Math.floor(delayMs + (Math.random() - 0.5) * 2 * jitterAmount));

      logger.info("Retrying Semantic Scholar after delay", { attempt: attempt + 1, delayMs });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError ?? new Error("Semantic Scholar search failed after all retries");
}

// ============================================================
// PubMed Search
// ============================================================

async function searchPubMed(
  query: string,
  maxResults: number,
  _filters: {
    publicationYearFrom?: number;
    publicationYearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
  }
): Promise<AcademicPaper[]> {
  const logger = createServiceLogger("academic_search", "searchPubMed");
  const email = env.PUBMED_EMAIL || "support@solomindlm.com";

  // Step 1: esearch to get PMC IDs
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=${encodeURIComponent(query)}&retmax=${maxResults}&sort=relevance&retmode=json&email=${encodeURIComponent(email)}`;

  const idList = await invokeWithHttpRetry(
    async () => {
      const t0 = Date.now();
      logger.apiCall("pubmed", "esearch", { query: query.substring(0, 50) });

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.apiError("pubmed", "esearch", new Error(`HTTP ${response.status}`), {
          status: response.status,
        });
        throw createExternalServiceErrorFromResponse(
          "pubmed",
          response.status,
          "esearch",
          errorText.slice(0, 500)
        );
      }

      const data = (await response.json()) as {
        esearchresult?: { idlist?: string[] };
      };

      logger.apiSuccess("pubmed", "esearch", Date.now() - t0, {
        count: data.esearchresult?.idlist?.length ?? 0,
      });

      return data.esearchresult?.idlist || [];
    },
    "pubmed_esearch"
  );

  if (idList.length === 0) {
    return [];
  }

  // Step 2: efetch to get metadata
  const ids = idList.join(",");
  const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${ids}&retmode=xml&email=${encodeURIComponent(email)}`;

  return invokeWithHttpRetry(
    async () => {
      const t0 = Date.now();
      logger.apiCall("pubmed", "efetch", { idCount: idList.length });

      const response = await fetch(fetchUrl, {
        headers: {
          "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.apiError("pubmed", "efetch", new Error(`HTTP ${response.status}`), {
          status: response.status,
        });
        throw createExternalServiceErrorFromResponse(
          "pubmed",
          response.status,
          "efetch",
          errorText.slice(0, 500)
        );
      }

      const xml = await response.text();
      logger.apiSuccess("pubmed", "efetch", Date.now() - t0, { idCount: idList.length });

      const articles = extractXmlBlocks(xml, "article");
      const papers: AcademicPaper[] = [];

      for (const article of articles) {
        // Title from <article-title>
        const title = stripXmlTags(extractTag(article, "article-title") || "Untitled");

        // Abstract: extract all <p> inside <abstract> or just the abstract tag content
        let abstractText: string;
        const abstractBlocks = extractXmlBlocks(article, "abstract");
        if (abstractBlocks.length > 0) {
          abstractText = stripXmlTags(abstractBlocks[0]);
        } else {
          abstractText = stripXmlTags(extractTag(article, "abstract") || "");
        }

        // Authors from <contrib contrib-type="author">
        const authors: string[] = [];
        const contribRegex = /<contrib[^>]*contrib-type=["']author["'][^>]*>([\s\S]*?)<\/contrib>/gi;
        let contribMatch;
        while ((contribMatch = contribRegex.exec(article)) !== null) {
          const contribXml = contribMatch[1];
          const surname = extractTag(contribXml, "surname");
          const givenNames = extractTag(contribXml, "given-names");
          const stringName = extractTag(contribXml, "string-name");
          const collectiveName = extractTag(contribXml, "collective-name");

          if (surname && givenNames) {
            authors.push(`${givenNames} ${surname}`);
          } else if (stringName) {
            authors.push(stringName);
          } else if (collectiveName) {
            authors.push(collectiveName);
          } else if (surname) {
            authors.push(surname);
          }
        }

        // Year from <pub-date>
        let year: number | undefined;
        const pubDateBlocks = extractXmlBlocks(article, "pub-date");
        if (pubDateBlocks.length > 0) {
          const yearStr = extractTag(pubDateBlocks[0], "year");
          if (yearStr) {
            year = parseInt(yearStr, 10);
            if (isNaN(year)) {
              year = undefined;
            }
          }
        }
        if (!year) {
          const yearStr = extractTag(article, "year");
          if (yearStr) {
            year = parseInt(yearStr, 10);
            if (isNaN(year)) {
              year = undefined;
            }
          }
        }

        // DOI from <article-id pub-id-type="doi">
        let doi: string | undefined;
        const articleIdRegex = /<article-id[^>]*pub-id-type=["']doi["'][^>]*>([^<]*)<\/article-id>/gi;
        let idMatch;
        while ((idMatch = articleIdRegex.exec(article)) !== null) {
          if (idMatch[1].trim()) {
            doi = idMatch[1].trim();
            break;
          }
        }

        // Find PMC ID to build URL
        let pmcId: string | undefined;
        const pmcIdRegex = /<article-id[^>]*pub-id-type=["']pmc["'][^>]*>([^<]*)<\/article-id>/gi;
        let pmcMatch;
        while ((pmcMatch = pmcIdRegex.exec(article)) !== null) {
          if (pmcMatch[1].trim()) {
            pmcId = pmcMatch[1].trim();
            break;
          }
        }

        // Fallback: try to find any numeric article-id
        if (!pmcId) {
          const allIds = extractAllTags(article, "article-id");
          const numericId = allIds.find((id) => /^\d+$/.test(id));
          if (numericId) {
            pmcId = numericId;
          }
        }

        const url = pmcId
          ? `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${pmcId}/`
          : `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}`;
        const pdfUrl = pmcId
          ? `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${pmcId}/pdf/`
          : undefined;

        const basePaper: Omit<AcademicPaper, "score"> = {
          title,
          authors,
          year,
          abstract: abstractText,
          url,
          pdfUrl,
          source: "pubmed",
          citationCount: undefined,
          doi,
        };

        papers.push({ ...basePaper, score: calculateScore(basePaper) });
      }

      return papers;
    },
    "pubmed_efetch"
  );
}

// ============================================================
// Result Processing (deduplication, filtering, sorting)
// ============================================================

export function deduplicatePapers(papers: AcademicPaper[]): AcademicPaper[] {
  const seen = new Set<string>();
  return papers.filter((paper) => {
    const key = paper.doi ? paper.doi.toLowerCase() : normalizeTitle(paper.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function filterPapers(
  papers: AcademicPaper[],
  filters: {
    publicationYearFrom?: number;
    publicationYearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
  }
): AcademicPaper[] {
  return papers.filter((paper) => {
    if (filters.publicationYearFrom && (paper.year ?? 0) < filters.publicationYearFrom) {
      return false;
    }
    if (filters.publicationYearTo && (paper.year ?? 9999) > filters.publicationYearTo) {
      return false;
    }
    if (filters.minCitations && (paper.citationCount ?? 0) < filters.minCitations) {
      return false;
    }
    if (filters.openAccessOnly && !paper.pdfUrl) {
      return false;
    }
    return true;
  });
}

export function sortPapers(papers: AcademicPaper[], sortBy: string): AcademicPaper[] {
  const sorted = [...papers];
  if (sortBy === "citations") {
    sorted.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
  } else {
    // relevance: use internal score (citation + recency blend)
    sorted.sort((a, b) => b.score - a.score);
  }
  return sorted;
}

// ============================================================
// Internal Action (makes actual API calls)
// ============================================================

export interface SearchInternalArgs {
  query: string;
  maxResults: number;
  publicationYearFrom?: number;
  publicationYearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
  sortBy?: string;
}

export async function searchInternalHandler(
  args: SearchInternalArgs
): Promise<AcademicPaper[]> {
  const {
    query,
    maxResults,
    publicationYearFrom,
    publicationYearTo,
    minCitations,
    openAccessOnly,
    sortBy,
  } = args;

  const logger = createServiceLogger("academic_search", "searchInternal");
  const startTime = Date.now();

  const filters = {
    publicationYearFrom,
    publicationYearTo,
    minCitations,
    openAccessOnly,
  };

  logger.operationStart({
    queryLen: query.length,
    maxResults,
    publicationYearFrom: publicationYearFrom ?? null,
    publicationYearTo: publicationYearTo ?? null,
    minCitations: minCitations ?? null,
    openAccessOnly: openAccessOnly ?? null,
    sortBy: sortBy || "relevance",
  });

  // Distribute maxResults across the three APIs
  const perSourceMax = Math.ceil(maxResults / 3);

  try {
    // Call APIs in parallel with 200ms stagger to avoid rate-limit issues
    const arxivPromise = searchArxiv(query, perSourceMax, filters);
    await delay(200);

    // Wrap Semantic Scholar in an 8-second timeout so rate-limit retries
    // don't block the entire search (arXiv + PubMed usually finish in ~2s)
    const semanticPromise = Promise.race([
      searchSemanticScholar(query, perSourceMax, filters),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Semantic Scholar timeout after 8000ms")), 8000)
      ),
    ]);
    await delay(200);

    const pubmedPromise = searchPubMed(query, perSourceMax, filters);

    const [arxivResults, semanticResults, pubmedResults] = await Promise.all([
      arxivPromise.catch((error) => {
        logger.warn("arXiv search failed", { message: (error as Error).message });
        return [] as AcademicPaper[];
      }),
      semanticPromise.catch((error) => {
        logger.warn("Semantic Scholar search failed", { message: (error as Error).message });
        return [] as AcademicPaper[];
      }),
      pubmedPromise.catch((error) => {
        logger.warn("PubMed search failed", { message: (error as Error).message });
        return [] as AcademicPaper[];
      }),
    ]);

    const allPapers = [...arxivResults, ...semanticResults, ...pubmedResults];

    // Deduplicate by DOI or normalized title
    let papers = deduplicatePapers(allPapers);

    // Apply filters
    papers = filterPapers(papers, filters);

    // Sort
    papers = sortPapers(papers, sortBy || "relevance");

    // Cap to maxResults
    papers = papers.slice(0, maxResults);

    logger.operationComplete({
      count: papers.length,
      arxivCount: arxivResults.length,
      semanticCount: semanticResults.length,
      pubmedCount: pubmedResults.length,
      durationMs: Date.now() - startTime,
    });

    return papers;
  } catch (error) {
    logger.operationError(error);
    throw error;
  }
}

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
  handler: async (_, args) => searchInternalHandler(args),
});

// ============================================================
// Cached Wrapper
// ============================================================

const searchCache = createCachedAction(
  internal._services.search.AcademicSearchService.searchInternal,
  { ttl: withJitter(CACHE_TTL.search * 24, 0.15), name: "academic-search-v2" } // 24h cache for academic papers
);

/**
 * Normalize query for better cache hits
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

// ============================================================
// Public Cached Action
// ============================================================

/**
 * Discover academic papers using multiple APIs (arXiv, Semantic Scholar, PubMed)
 * with aggressive caching (24h) since papers don't change frequently.
 * Results are transformed into the DiscoveredSource format.
 */
export interface DiscoverAcademicPapersArgs {
  query: string;
  maxResults?: number;
  publicationYearFrom?: number;
  publicationYearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
  sortBy?: string;
}

export async function discoverAcademicPapersInternalHandler(
  args: DiscoverAcademicPapersArgs,
  fetchPapers: (args: SearchInternalArgs) => Promise<AcademicPaper[]> = (a) => searchInternalHandler(a)
): Promise<DiscoveredSource[]> {
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
    const papers = await fetchPapers({
      query: normalizedQuery,
      maxResults: args.maxResults ?? 20,
      publicationYearFrom: args.publicationYearFrom,
      publicationYearTo: args.publicationYearTo,
      minCitations: args.minCitations,
      openAccessOnly: args.openAccessOnly,
      sortBy: args.sortBy ?? "relevance",
    });

    // Transform AcademicPaper[] → DiscoveredSource[]
    const sources: DiscoveredSource[] = papers.map(toDiscoveredSource);

    logger.operationComplete({
      count: sources.length,
      durationMs: Date.now() - startTime,
    });

    return sources;
  } catch (error) {
    logger.operationError(error);
    throw error;
  }
}

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
      const sources: DiscoveredSource[] = (papers as AcademicPaper[]).map(toDiscoveredSource);

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

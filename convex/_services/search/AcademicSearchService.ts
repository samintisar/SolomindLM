"use node";

import { internalAction, type ActionCtx } from "../../_generated/server";
import { v } from "convex/values";
import { createCachedAction } from "../cache/cachedAgent";
import { CACHE_TTL, withJitter } from "../cache/cache";
import { internal } from "../../_generated/api";
import { ARXIV_MIN_INTERVAL_MS } from "../../_lib/arxivThrottle";
import { env } from "../../_lib/env";
import {
  resolveAcademicSearchSources,
  type AcademicPaperSource,
} from "../../_model/literatureReviewSearchOptions";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import {
  createExternalServiceErrorFromResponse,
  ExternalServiceError,
  isRetryableHttpStatus,
} from "../../_lib/errors";
import {
  ARXIV_RATE_LIMIT_COOLDOWN_MS,
  SEMANTIC_SCHOLAR_AUTHENTICATED_COOLDOWN_MS,
  SEMANTIC_SCHOLAR_UNAUTHENTICATED_COOLDOWN_MS,
  type FragileAcademicProvider,
} from "../../_lib/externalProviderCooldowns";
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
  source: AcademicPaperSource;
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
    sourceApi?: AcademicPaperSource;
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
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

/** Coerce API year values (null/NaN) to optional number for Convex validators. */
export function normalizePublicationYear(year: number | null | undefined): number | undefined {
  if (year == null || typeof year !== "number" || Number.isNaN(year)) {
    return undefined;
  }
  return year;
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

const SEMANTIC_SCHOLAR_GAP_MS = 1000;

/** Action context for deployment-wide arXiv throttle (omit in unit tests). */
export type AcademicSearchThrottleCtx = Pick<ActionCtx, "runMutation">;

type ProviderCooldownStatus = {
  coolingDown: boolean;
  retryAfterMs: number;
  cooldownUntil?: number;
};

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) {
    return undefined;
  }
  return Math.max(0, dateMs - Date.now());
}

async function checkProviderCooldown(
  throttleCtx: AcademicSearchThrottleCtx | null | undefined,
  provider: FragileAcademicProvider,
  logger: ReturnType<typeof createServiceLogger>
): Promise<ProviderCooldownStatus> {
  if (!throttleCtx) {
    return { coolingDown: false, retryAfterMs: 0 };
  }
  const status = (await throttleCtx.runMutation(
    internal._lib.externalProviderCooldowns.checkProviderCooldown,
    { provider }
  )) as ProviderCooldownStatus | null | undefined;

  if (status?.coolingDown) {
    logger.warn("Academic provider cooling down, skipping", {
      provider,
      retryAfterMs: status.retryAfterMs,
      cooldownUntil: status.cooldownUntil,
    });
    return status;
  }
  return { coolingDown: false, retryAfterMs: 0 };
}

async function recordProviderRateLimit(
  throttleCtx: AcademicSearchThrottleCtx | null | undefined,
  provider: FragileAcademicProvider,
  fallbackCooldownMs: number,
  retryAfterMs: number | undefined,
  logger: ReturnType<typeof createServiceLogger>
): Promise<void> {
  if (!throttleCtx) return;
  const cooldownMs = retryAfterMs ?? fallbackCooldownMs;
  await throttleCtx.runMutation(internal._lib.externalProviderCooldowns.recordProviderCooldown, {
    provider,
    cooldownMs,
    status: 429,
    reason: retryAfterMs ? "HTTP 429 Retry-After" : "HTTP 429",
  });
  logger.warn("Academic provider cooldown recorded", { provider, cooldownMs });
}

function parseArxivEntries(xml: string, query: string): AcademicPaper[] {
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

    const authorNames = extractAllTags(entry, "name");

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

    if (!articleUrl) {
      const idMatch = entry.match(/<id>([^<]+)<\/id>/);
      if (idMatch) {
        articleUrl = idMatch[1].trim();
      }
    }

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
}

async function searchArxiv(
  throttleCtx: AcademicSearchThrottleCtx | null | undefined,
  query: string,
  maxResults: number
): Promise<{ papers: AcademicPaper[]; slotUsed: boolean; rateLimited: boolean }> {
  const logger = createServiceLogger("academic_search", "searchArxiv");
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;

  const cooldown = await checkProviderCooldown(throttleCtx, "arxiv", logger);
  if (cooldown.coolingDown) {
    return { papers: [], slotUsed: false, rateLimited: true };
  }

  if (throttleCtx) {
    const slot = await throttleCtx.runMutation(internal._lib.arxivThrottle.tryAcquireArxivSlot, {});
    if (!slot.acquired) {
      logger.warn("arXiv throttled, skipping", { waitMs: slot.waitMs });
      return { papers: [], slotUsed: false, rateLimited: true };
    }
  }

  const t0 = Date.now();
  logger.apiCall("arxiv", "/api/query", { query: query.substring(0, 50) });

  const response = await fetch(url, {
    headers: {
      "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
    },
  });

  if (response.status === 429) {
    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    const errorText = await response.text();
    logger.apiError("arxiv", "/api/query", new Error("HTTP 429"), { status: 429 });
    logger.warn("arXiv HTTP 429: Rate exceeded.", {
      message: errorText.slice(0, 200),
    });
    await recordProviderRateLimit(
      throttleCtx,
      "arxiv",
      ARXIV_RATE_LIMIT_COOLDOWN_MS,
      retryAfterMs,
      logger
    );
    return { papers: [], slotUsed: true, rateLimited: true };
  }

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
  return { papers: parseArxivEntries(xml, query), slotUsed: true, rateLimited: false };
}

function isHttp429Error(error: unknown): boolean {
  if (error instanceof ExternalServiceError) {
    return error.statusCode === 429;
  }
  const m = (error as Error).message?.match(/\bHTTP\s+429\b/i);
  return Boolean(m);
}

// ============================================================
// Semantic Scholar Search
// ============================================================

async function searchSemanticScholar(
  throttleCtx: AcademicSearchThrottleCtx | null | undefined,
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

        logger.apiError("semantic_scholar", "/graph/v1/paper/search", new Error(`HTTP ${status}`), {
          status,
        });

        retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        if (status === 429) {
          logger.warn("Semantic Scholar HTTP 429, no retry");
          await recordProviderRateLimit(
            throttleCtx,
            "semantic_scholar",
            env.SEMANTIC_SCHOLAR_API_KEY
              ? SEMANTIC_SCHOLAR_AUTHENTICATED_COOLDOWN_MS
              : SEMANTIC_SCHOLAR_UNAUTHENTICATED_COOLDOWN_MS,
            retryAfterMs,
            logger
          );
          throw createExternalServiceErrorFromResponse(
            "semantic_scholar",
            status,
            "/graph/v1/paper/search",
            errorText.slice(0, 500)
          );
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
          year: normalizePublicationYear(item.year),
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

      const statusCode = (() => {
        if (lastError instanceof ExternalServiceError) return lastError.statusCode;
        const m = lastError.message.match(/\bHTTP\s+(\d{3})\b/i);
        return m ? parseInt(m[1], 10) : undefined;
      })();

      if (statusCode === 429 || attempt >= MAX_ATTEMPTS - 1) {
        break;
      }

      const isRetryable =
        lastError instanceof ExternalServiceError
          ? lastError.retryable
          : statusCode !== undefined && isRetryableHttpStatus(statusCode);

      if (!isRetryable) {
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
// OpenAlex Search
// ============================================================

function reconstructOpenAlexAbstract(
  invertedIndex: Record<string, number[]> | null | undefined
): string {
  if (!invertedIndex) return "";
  const words: Array<{ word: string; position: number }> = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) {
      words.push({ word, position });
    }
  }
  return words
    .sort((a, b) => a.position - b.position)
    .map(({ word }) => word)
    .join(" ");
}

function normalizeDoi(doi: string | null | undefined): string | undefined {
  return doi?.replace(/^https?:\/\/doi\.org\//i, "");
}

async function searchOpenAlex(
  query: string,
  maxResults: number
): Promise<AcademicPaper[]> {
  const logger = createServiceLogger("academic_search", "searchOpenAlex");
  const email = env.PUBMED_EMAIL || "support@solomindlm.com";
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${maxResults}&mailto=${encodeURIComponent(email)}`;

  return invokeWithHttpRetry(async () => {
    const t0 = Date.now();
    logger.apiCall("openalex", "/works", { query: query.substring(0, 50) });

    const response = await fetch(url, {
      headers: {
        "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.apiError("openalex", "/works", new Error(`HTTP ${response.status}`), {
        status: response.status,
      });
      throw createExternalServiceErrorFromResponse(
        "openalex",
        response.status,
        "/works",
        errorText.slice(0, 500)
      );
    }

    const data = (await response.json()) as {
      results?: Array<{
        id?: string;
        doi?: string | null;
        display_name?: string;
        publication_year?: number | null;
        abstract_inverted_index?: Record<string, number[]> | null;
        cited_by_count?: number;
        authorships?: Array<{ author?: { display_name?: string } }>;
        open_access?: { oa_url?: string | null };
        primary_location?: { landing_page_url?: string | null };
      }>;
    };

    logger.apiSuccess("openalex", "/works", Date.now() - t0, {
      count: data.results?.length ?? 0,
    });

    return (data.results ?? []).map((item) => {
      const abstract = reconstructOpenAlexAbstract(item.abstract_inverted_index);
      const basePaper: Omit<AcademicPaper, "score"> = {
        title: item.display_name || "Untitled",
        authors:
          item.authorships
            ?.map((authorship) => authorship.author?.display_name)
            .filter((name): name is string => Boolean(name)) ?? [],
        year: normalizePublicationYear(item.publication_year),
        abstract,
        url: item.primary_location?.landing_page_url || item.id || "https://openalex.org",
        pdfUrl: item.open_access?.oa_url || undefined,
        source: "openalex",
        citationCount: item.cited_by_count,
        doi: normalizeDoi(item.doi),
      };
      return { ...basePaper, score: calculateScore(basePaper) };
    });
  }, "openalex_search");
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

  const idList = await invokeWithHttpRetry(async () => {
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
  }, "pubmed_esearch");

  if (idList.length === 0) {
    return [];
  }

  // Step 2: efetch to get metadata
  const ids = idList.join(",");
  const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${ids}&retmode=xml&email=${encodeURIComponent(email)}`;

  return invokeWithHttpRetry(async () => {
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
  }, "pubmed_efetch");
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
    hasFullText?: boolean;
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
    if (filters.hasFullText && !paper.pdfUrl?.trim()) {
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

/** Thrown by searchInternalForCache so ActionCache does not store empty results. */
export const ACADEMIC_SEARCH_EMPTY_SKIP_CACHE = "ACADEMIC_SEARCH_EMPTY_SKIP_CACHE";

export interface SearchInternalResult {
  papers: AcademicPaper[];
  /** True when one or more APIs returned HTTP 429 or arXiv global throttle skipped. */
  rateLimited: boolean;
}

export interface DiscoverAcademicPapersResult {
  sources: DiscoveredSource[];
  rateLimited: boolean;
}

/** Normalize discover action result (array legacy shape or { sources, rateLimited }). */
export function academicDiscoverSources(
  result: DiscoverAcademicPapersResult | DiscoveredSource[]
): DiscoveredSource[] {
  return Array.isArray(result) ? result : result.sources;
}

export interface SearchInternalArgs {
  query: string;
  maxResults: number;
  publicationYearFrom?: number;
  publicationYearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
  hasFullText?: boolean;
  /** Extra topical phrases (from field-of-study UI) concatenated into the retrieval query */
  fieldOfStudyTerms?: string[];
  sortBy?: string;
  /** When set, only query these APIs (default: semantic_scholar → pubmed → arxiv). */
  sources?: AcademicPaperSource[];
}

export async function searchInternalHandler(
  args: SearchInternalArgs,
  throttleCtx?: AcademicSearchThrottleCtx | null
): Promise<SearchInternalResult> {
  const {
    query,
    maxResults,
    publicationYearFrom,
    publicationYearTo,
    minCitations,
    openAccessOnly,
    hasFullText,
    fieldOfStudyTerms,
    sortBy,
    sources: sourceAllowlist,
  } = args;

  const logger = createServiceLogger("academic_search", "searchInternal");
  const startTime = Date.now();

  const boost =
    fieldOfStudyTerms
      ?.filter((t) => t.trim().length > 0)
      .join(" ")
      .trim() ?? "";
  const effectiveQuery = boost ? `${query} ${boost}`.trim() : query;

  const filters = {
    publicationYearFrom,
    publicationYearTo,
    minCitations,
    openAccessOnly,
    hasFullText,
  };

  logger.operationStart({
    queryLen: query.length,
    maxResults,
    publicationYearFrom: publicationYearFrom ?? null,
    publicationYearTo: publicationYearTo ?? null,
    minCitations: minCitations ?? null,
    openAccessOnly: openAccessOnly ?? null,
    hasFullText: hasFullText ?? null,
    fieldBoostLen: boost.length,
    sortBy: sortBy || "relevance",
  });

  const orderedSources = resolveAcademicSearchSources(sourceAllowlist);
  const perSourceMax = maxResults;

  try {
    let arxivResults: AcademicPaper[] = [];
    let semanticResults: AcademicPaper[] = [];
    let openAlexResults: AcademicPaper[] = [];
    let pubmedResults: AcademicPaper[] = [];
    let arxivSlotUsed = false;
    let rateLimited = false;

    for (let i = 0; i < orderedSources.length; i++) {
      const source = orderedSources[i];
      if (i > 0 && arxivSlotUsed) {
        await delay(ARXIV_MIN_INTERVAL_MS);
        arxivSlotUsed = false;
      }

      if (source === "semantic_scholar") {
        const cooldown = await checkProviderCooldown(throttleCtx, "semantic_scholar", logger);
        if (cooldown.coolingDown) {
          rateLimited = true;
          continue;
        }
        const semanticPromise = Promise.race([
          searchSemanticScholar(throttleCtx, effectiveQuery, perSourceMax, filters),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Semantic Scholar timeout after 30000ms")), 30000)
          ),
        ]);
        semanticResults = await semanticPromise.catch((error) => {
          logger.warn("Semantic Scholar search failed", { message: (error as Error).message });
          if (isHttp429Error(error)) rateLimited = true;
          return [] as AcademicPaper[];
        });
        const next = orderedSources[i + 1];
        if (next) {
          await delay(SEMANTIC_SCHOLAR_GAP_MS);
        }
      } else if (source === "openalex") {
        openAlexResults = await searchOpenAlex(effectiveQuery, perSourceMax).catch((error) => {
          logger.warn("OpenAlex search failed", { message: (error as Error).message });
          return [] as AcademicPaper[];
        });
      } else if (source === "pubmed") {
        pubmedResults = await searchPubMed(effectiveQuery, perSourceMax, filters).catch((error) => {
          logger.warn("PubMed search failed", { message: (error as Error).message });
          return [] as AcademicPaper[];
        });
      } else if (source === "arxiv") {
        try {
          const arxiv = await searchArxiv(throttleCtx, effectiveQuery, perSourceMax);
          arxivResults = arxiv.papers;
          arxivSlotUsed = arxiv.slotUsed;
          if (arxiv.rateLimited) rateLimited = true;
        } catch (error) {
          logger.warn("arXiv search failed", { message: (error as Error).message });
          arxivResults = [];
        }
      }
    }

    const allPapers = [...semanticResults, ...openAlexResults, ...pubmedResults, ...arxivResults];

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
      openAlexCount: openAlexResults.length,
      pubmedCount: pubmedResults.length,
      rateLimited,
      durationMs: Date.now() - startTime,
    });

    return { papers, rateLimited };
  } catch (error) {
    logger.operationError(error);
    throw error;
  }
}

/** Used by ActionCache — only non-empty result sets are stored. */
export const searchInternalForCache = internalAction({
  args: {
    query: v.string(),
    maxResults: v.number(),
    publicationYearFrom: v.optional(v.number()),
    publicationYearTo: v.optional(v.number()),
    minCitations: v.optional(v.number()),
    openAccessOnly: v.optional(v.boolean()),
    hasFullText: v.optional(v.boolean()),
    fieldOfStudyTerms: v.optional(v.array(v.string())),
    sortBy: v.optional(v.string()),
    sources: v.optional(
      v.array(
        v.union(
          v.literal("openalex"),
          v.literal("arxiv"),
          v.literal("semantic_scholar"),
          v.literal("pubmed")
        )
      )
    ),
  },
  handler: async (ctx, args) => {
    const { papers } = await searchInternalHandler(args, ctx);
    if (papers.length === 0) {
      throw new Error(ACADEMIC_SEARCH_EMPTY_SKIP_CACHE);
    }
    return papers;
  },
});

export const searchInternal = internalAction({
  args: {
    query: v.string(),
    maxResults: v.number(),
    publicationYearFrom: v.optional(v.number()),
    publicationYearTo: v.optional(v.number()),
    minCitations: v.optional(v.number()),
    openAccessOnly: v.optional(v.boolean()),
    hasFullText: v.optional(v.boolean()),
    fieldOfStudyTerms: v.optional(v.array(v.string())),
    sortBy: v.optional(v.string()),
    sources: v.optional(
      v.array(
        v.union(
          v.literal("openalex"),
          v.literal("arxiv"),
          v.literal("semantic_scholar"),
          v.literal("pubmed")
        )
      )
    ),
  },
  handler: async (ctx, args) => searchInternalHandler(args, ctx),
});

// ============================================================
// Cached Wrapper
// ============================================================

const academicSearchActionCache = createCachedAction(
  internal._services.search.AcademicSearchService.searchInternalForCache,
  { ttl: withJitter(CACHE_TTL.search * 24, 0.15), name: "academic-search-v2" }
);

/** Cached academic search; empty results are never stored (retry can hit live APIs). */
export const searchCache = {
  async fetch(ctx: AcademicSearchThrottleCtx, args: SearchInternalArgs): Promise<AcademicPaper[]> {
    try {
      return await academicSearchActionCache.fetch(ctx, args);
    } catch (error) {
      if (error instanceof Error && error.message === ACADEMIC_SEARCH_EMPTY_SKIP_CACHE) {
        return [];
      }
      throw error;
    }
  },
};

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
  hasFullText?: boolean;
  fieldOfStudyTerms?: string[];
  sortBy?: string;
}

export async function discoverAcademicPapersInternalHandler(
  args: DiscoverAcademicPapersArgs,
  fetchSearch: (
    args: SearchInternalArgs
  ) => Promise<SearchInternalResult> = (a) => searchInternalHandler(a)
): Promise<DiscoverAcademicPapersResult> {
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
    const { papers, rateLimited } = await fetchSearch({
      query: normalizedQuery,
      maxResults: args.maxResults ?? 20,
      publicationYearFrom: args.publicationYearFrom,
      publicationYearTo: args.publicationYearTo,
      minCitations: args.minCitations,
      openAccessOnly: args.openAccessOnly,
      hasFullText: args.hasFullText,
      fieldOfStudyTerms: args.fieldOfStudyTerms,
      sortBy: args.sortBy ?? "relevance",
    });

    const sources: DiscoveredSource[] = papers.map(toDiscoveredSource);

    logger.operationComplete({
      count: sources.length,
      rateLimited,
      durationMs: Date.now() - startTime,
    });

    return { sources, rateLimited };
  } catch (error) {
    logger.operationError(error);
    throw error;
  }
}

/** Live academic discover (no action-cache) for source discovery UI. */
export async function discoverAcademicPapersLive(
  ctx: ActionCtx,
  args: DiscoverAcademicPapersArgs
): Promise<DiscoverAcademicPapersResult> {
  const logger = createServiceLogger("academic_search", "discoverAcademicPapersInternal");
  const startTime = Date.now();
  const normalizedQuery = normalizeQuery(args.query);

  logger.operationStart({
    queryPreview: normalizedQuery.substring(0, 50),
    publicationYearFrom: args.publicationYearFrom ?? null,
    publicationYearTo: args.publicationYearTo ?? null,
    minCitations: args.minCitations ?? null,
    hasFullText: args.hasFullText ?? null,
    fieldTerms: args.fieldOfStudyTerms?.length ?? 0,
  });

  const searchResult = (await ctx.runAction(
    internal._services.search.AcademicSearchService.searchInternal,
    {
      query: normalizedQuery,
      maxResults: args.maxResults ?? 20,
      publicationYearFrom: args.publicationYearFrom,
      publicationYearTo: args.publicationYearTo,
      minCitations: args.minCitations,
      openAccessOnly: args.openAccessOnly,
      hasFullText: args.hasFullText,
      fieldOfStudyTerms: args.fieldOfStudyTerms,
      sortBy: args.sortBy ?? "relevance",
    }
  )) as SearchInternalResult;

  const sources: DiscoveredSource[] = searchResult.papers.map(toDiscoveredSource);

  logger.operationComplete({
    count: sources.length,
    rateLimited: searchResult.rateLimited,
    durationMs: Date.now() - startTime,
  });

  return { sources, rateLimited: searchResult.rateLimited };
}

export const discoverAcademicPapersInternal = internalAction({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
    publicationYearFrom: v.optional(v.number()),
    publicationYearTo: v.optional(v.number()),
    minCitations: v.optional(v.number()),
    openAccessOnly: v.optional(v.boolean()),
    hasFullText: v.optional(v.boolean()),
    fieldOfStudyTerms: v.optional(v.array(v.string())),
    sortBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => discoverAcademicPapersLive(ctx, args),
});

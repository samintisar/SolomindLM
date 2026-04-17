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

/**
 * Academic paper discovery result from OpenAlex
 */
export interface AcademicPaper {
  id: string;
  title: string;
  url: string;
  snippet: string; // Abstract if available
  score: number;
  publishedDate?: string;
  publicationYear?: number;
  authors: string[];
  venue?: string;
  citationCount: number;
  openAccess: boolean;
  hasFullText: boolean;
  type: string;
}

// ============================================================
// Internal Action (makes actual API call)
// ============================================================

export const searchInternal = internalAction({
  args: {
    query: v.string(),
    maxResults: v.number(),
    publicationYearFrom: v.optional(v.number()),
    publicationYearTo: v.optional(v.number()),
    minCitations: v.optional(v.number()),
    openAccessOnly: v.optional(v.boolean()),
    hasFullText: v.optional(v.boolean()),
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
      hasFullText,
      sortBy,
    }
  ) => {
    const logger = createServiceLogger("openalex", "searchInternal");
    const startTime = Date.now();
    const baseUrl = env.OPENALEX_BASE_URL || "https://api.openalex.org";

    const filters: string[] = [];

    if (publicationYearFrom) {
      filters.push(`publication_year:>${publicationYearFrom - 1}`);
    }
    if (publicationYearTo) {
      filters.push(`publication_year:<${publicationYearTo + 1}`);
    }
    if (minCitations) {
      filters.push(`cited_by_count:>${minCitations - 1}`);
    }
    if (openAccessOnly) {
      filters.push(`open_access.is_oa:true`);
    }
    if (hasFullText) {
      filters.push(`has_fulltext:true`);
    }

    let sortParam = "";
    if (sortBy === "citations") {
      sortParam = "&sort=cited_by_count:desc";
    } else if (sortBy === "date") {
      sortParam = "&sort=publication_date:desc";
    }

    const filterParam = filters.length > 0 ? `&filter=${filters.join(",")}` : "";
    const url = `${baseUrl}/works?search=${encodeURIComponent(query)}${filterParam}${sortParam}&per_page=${maxResults}`;

    logger.operationStart({
      queryLen: query.length,
      filterCount: filters.length,
      sortBy: sortBy || "relevance",
      maxResults,
    });

    try {
      const data = await invokeWithHttpRetry(async () => {
        const t0 = Date.now();
        logger.apiCall("openalex", "/works", { path: "works" });
        const response = await fetch(url, {
          headers: {
            "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.apiError("openalex", "/works", new Error(`HTTP ${response.status}`), {
            sortBy,
          });
          throw createExternalServiceErrorFromResponse(
            "openalex",
            response.status,
            "/works",
            errorText.slice(0, 500)
          );
        }

        logger.apiSuccess("openalex", "/works", Date.now() - t0, { maxResults });
        return (await response.json()) as {
          results?: any[];
          meta?: { count?: number };
        };
      }, "openalex_search");

      // Extract and transform results
      const papers: AcademicPaper[] = (data.results || []).map((work: any) => {
        // Extract authors
        const authors = (work.authorships || [])
          .map((auth: any) => auth.author?.display_name)
          .filter(Boolean);

        // Extract venue
        const venue =
          work.primary_location?.source?.display_name || work.host_venue?.display_name || work.type;

        // Extract publication date
        const publicationYear = work.publication_year;
        const publishedDate = work.publication_date;

        // Extract open access info
        const openAccess = work.open_access?.is_oa || false;
        const hasFullText =
          !!work.best_oa_location?.pdf_url ||
          !!work.best_oa_location?.landing_page_url ||
          openAccess;

        // Build URL (prefer PDF, then landing page, then OpenAlex page)
        const pdfUrl = work.best_oa_location?.pdf_url;
        const landingUrl = work.best_oa_location?.landing_page_url;
        const openAlexUrl = work.id;
        const url = pdfUrl || landingUrl || openAlexUrl;

        // Build snippet (abstract or first sentence of title)
        let snippet = work.title || "";
        if (work.abstract) {
          // OpenAlex abstracts are XML-tagged, clean them up
          snippet = work.abstract
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 500);
        } else if (work.title) {
          snippet = work.title;
        }

        // Calculate score (combination of citation count and recency)
        const citationScore = Math.min(work.cited_by_count || 0, 1000) / 1000; // Max 1.0 for 1000+ citations
        const recencyScore = publicationYear ? Math.min(publicationYear, 2024) / 2024 : 0.5;
        const score = citationScore * 0.7 + recencyScore * 0.3;

        return {
          id: work.id,
          title: work.title || "Untitled",
          url: url,
          snippet,
          score,
          publishedDate,
          publicationYear,
          authors,
          venue,
          citationCount: work.cited_by_count || 0,
          openAccess,
          hasFullText,
          type: work.type || "article",
        };
      });

      // Sort by score (descending) - this is our internal relevance score
      papers.sort((a, b) => b.score - a.score);

      logger.operationComplete({ count: papers.length, durationMs: Date.now() - startTime });
      return papers;
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
  internal._services.search.OpenAlexSearchService.searchInternal,
  { ttl: withJitter(CACHE_TTL.search * 24, 0.15), name: "openalex-search" } // 24h cache for academic papers
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
 * Discover academic papers using OpenAlex API with caching
 * This action is cached aggressively (24h) since papers don't change
 */
export const discoverAcademicPapersInternal = internalAction({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
    publicationYearFrom: v.optional(v.number()),
    publicationYearTo: v.optional(v.number()),
    minCitations: v.optional(v.number()),
    openAccessOnly: v.optional(v.boolean()),
    hasFullText: v.optional(v.boolean()),
    sortBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const logger = createServiceLogger("openalex", "discoverAcademicPapersInternal");
    const startTime = Date.now();
    const normalizedQuery = normalizeQuery(args.query);

    logger.operationStart({
      queryPreview: normalizedQuery.substring(0, 50),
      publicationYearFrom: args.publicationYearFrom ?? null,
      publicationYearTo: args.publicationYearTo ?? null,
      minCitations: args.minCitations ?? null,
    });

    try {
      const result = await searchCache.fetch(ctx, {
        query: normalizedQuery,
        maxResults: args.maxResults ?? 20,
        publicationYearFrom: args.publicationYearFrom,
        publicationYearTo: args.publicationYearTo,
        minCitations: args.minCitations,
        openAccessOnly: args.openAccessOnly,
        hasFullText: args.hasFullText,
        sortBy: args.sortBy ?? "relevance",
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

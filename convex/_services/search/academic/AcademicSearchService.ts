"use node";

import { internalAction } from "../../../_generated/server";
import { v } from "convex/values";
import { createCachedAction } from "../../cache/cachedAgent";
import { CACHE_TTL, withJitter } from "../../cache/cache";
import { internal } from "../../../_generated/api";
import { createServiceLogger } from "../../../_lib/logging/serviceLogger";
import {
  AcademicPaper,
  DiscoveredSource,
  SearchInternalArgs,
  DiscoverAcademicPapersArgs,
} from "./types";
import { delay, deduplicatePapers, filterPapers, sortPapers, toDiscoveredSource } from "./utils/paperProcessing";
import { searchArxiv } from "./providers/arxiv";
import { searchSemanticScholar } from "./providers/semanticScholar";
import { searchPubMed } from "./providers/pubmed";

// Re-export types for backward compatibility
export type { AcademicPaper, DiscoveredSource, SearchInternalArgs, DiscoverAcademicPapersArgs };

export async function searchInternalHandler(args: SearchInternalArgs): Promise<AcademicPaper[]> {
  const {
    query,
    maxResults,
    publicationYearFrom,
    publicationYearTo,
    minCitations,
    openAccessOnly,
    hasFullText,
    fieldsOfStudy,
    provider = "all",
    sortBy,
  } = args;

  const logger = createServiceLogger("academic_search", "searchInternal");
  const startTime = Date.now();

  const filters = {
    publicationYearFrom,
    publicationYearTo,
    minCitations,
    openAccessOnly,
    hasFullText,
    fieldsOfStudy,
  };

  logger.operationStart({
    queryLen: query.length,
    maxResults,
    publicationYearFrom: publicationYearFrom ?? null,
    publicationYearTo: publicationYearTo ?? null,
    minCitations: minCitations ?? null,
    openAccessOnly: openAccessOnly ?? null,
    hasFullText: hasFullText ?? null,
    fieldsOfStudyCount: fieldsOfStudy?.length ?? 0,
    provider,
    sortBy: sortBy || "relevance",
  });

  try {
    let allPapers: AcademicPaper[] = [];
    let arxivCount = 0;
    let semanticCount = 0;
    let pubmedCount = 0;

    if (provider === "pubmed") {
      const pubmedResults = await searchPubMed(query, maxResults, filters).catch((error) => {
        logger.warn("PubMed search failed", { message: (error as Error).message });
        return [] as AcademicPaper[];
      });
      pubmedCount = pubmedResults.length;
      allPapers = pubmedResults;
    } else if (provider === "arxiv") {
      const arxivResults = await searchArxiv(query, maxResults, filters).catch((error) => {
        logger.warn("arXiv search failed", { message: (error as Error).message });
        return [] as AcademicPaper[];
      });
      arxivCount = arxivResults.length;
      allPapers = arxivResults;
    } else {
      // Distribute maxResults across the three APIs
      const perSourceMax = Math.ceil(maxResults / 3);

      const arxivPromise = searchArxiv(query, perSourceMax, filters);
      await delay(200);

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

      arxivCount = arxivResults.length;
      semanticCount = semanticResults.length;
      pubmedCount = pubmedResults.length;
      allPapers = [...arxivResults, ...semanticResults, ...pubmedResults];
    }

    let papers = deduplicatePapers(allPapers);
    papers = filterPapers(papers, filters);
    papers = sortPapers(papers, sortBy || "relevance");
    papers = papers.slice(0, maxResults);

    logger.operationComplete({
      count: papers.length,
      arxivCount,
      semanticCount,
      pubmedCount,
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
    hasFullText: v.optional(v.boolean()),
    fieldsOfStudy: v.optional(v.array(v.string())),
    provider: v.optional(
      v.union(v.literal("all"), v.literal("pubmed"), v.literal("arxiv"))
    ),
    sortBy: v.optional(v.string()),
  },
  handler: async (_, args) => searchInternalHandler(args),
});

const searchCache = createCachedAction(
  internal._services.search.academic.AcademicSearchService.searchInternal,
  { ttl: withJitter(CACHE_TTL.search * 24, 0.15), name: "academic-search-v2" }
);

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

export async function discoverAcademicPapersInternalHandler(
  args: DiscoverAcademicPapersArgs,
  fetchPapers: (args: SearchInternalArgs) => Promise<AcademicPaper[]> = (a) =>
    searchInternalHandler(a)
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
      hasFullText: args.hasFullText,
      fieldsOfStudy: args.fieldsOfStudy,
      provider: args.provider,
      sortBy: args.sortBy ?? "relevance",
    });

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
    hasFullText: v.optional(v.boolean()),
    fieldsOfStudy: v.optional(v.array(v.string())),
    provider: v.optional(
      v.union(v.literal("all"), v.literal("pubmed"), v.literal("arxiv"))
    ),
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
        hasFullText: args.hasFullText,
        fieldsOfStudy: args.fieldsOfStudy,
        provider: args.provider,
        sortBy: args.sortBy ?? "relevance",
      });

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

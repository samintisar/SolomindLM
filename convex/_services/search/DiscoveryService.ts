"use node";

import { getAuthUserId } from "../../auth";
import { action } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";

/**
 * Unified discovery result format
 * Normalizes results from different APIs (Tavily, Academic APIs)
 */
export interface UnifiedDiscoveryResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
  sourceType: "web" | "news" | "academic" | "finance";
  publishedDate?: string;
  metadata: {
    // Academic-specific
    authors?: string[];
    venue?: string;
    citationCount?: number;
    openAccess?: boolean;
    hasFullText?: boolean;
    publicationYear?: number;
    type?: string;
    doi?: string;
    openAlexId?: string;
    pdfUrl?: string;
    landingPageUrl?: string;
    license?: string;

    // Web/News-specific
    domain?: string;
    relevanceLabel?: "high" | "medium" | "low";
  };
}

/**
 * Discovery request options with filtering
 */
export interface DiscoveryRequest {
  query: string;
  sourceTypes: ("web" | "news" | "academic" | "finance")[];
  timeRange?: "day" | "week" | "month" | "year";
  filters: {
    academic?: {
      publicationYear?: { from?: number; to?: number };
      minCitations?: number;
      openAccessOnly?: boolean;
      hasFullText?: boolean;
    };
  };
  /** Cap on merged list; split evenly across each selected source type (e.g. 20 with web+academic → 10 each). */
  maxResults: number;
  sortBy?: "relevance" | "date" | "citations";
}

/**
 * Normalize scores from different APIs to a common scale
 * Tavily scores: 0-1 (semantic relevance)
 * Academic API scores: 0-1 (calculated from citations + recency)
 */
export function normalizeScore(score: number, _sourceType: string): number {
  // Scores are already normalized to 0-1 range from both APIs
  return Math.min(Math.max(score, 0), 1);
}

/**
 * Convert relevance score to label
 */
export function getRelevanceLabel(score: number): "high" | "medium" | "low" {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

/**
 * Transform web search result to unified format
 */
export function transformWebResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * Transform academic result to unified format
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformAcademicResult(result: any): UnifiedDiscoveryResult {
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
      relevanceLabel: getRelevanceLabel(result.score),
    },
  };
}

/**
 * Sort results based on sort option
 */
export function sortResults(
  results: UnifiedDiscoveryResult[],
  sortBy: "relevance" | "date" | "citations"
): UnifiedDiscoveryResult[] {
  const sorted = [...results];
  switch (sortBy) {
    case "date":
      return sorted.sort((a, b) => {
        if (!a.publishedDate && !b.publishedDate) return b.score - a.score;
        if (!a.publishedDate) return 1;
        if (!b.publishedDate) return -1;
        return new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime();
      });
    case "citations":
      return sorted.sort((a, b) => {
        const aCitations = a.metadata?.citationCount || 0;
        const bCitations = b.metadata?.citationCount || 0;
        return bCitations - aCitations;
      });
    case "relevance":
    default:
      return sorted.sort((a, b) => b.score - a.score);
  }
}

/**
 * Distribute results evenly across source types when multiple are selected
 */
export function distributeResults(
  resultsBySource: { sourceType: string; results: UnifiedDiscoveryResult[] }[],
  maxResults: number
): UnifiedDiscoveryResult[] {
  const totalSources = resultsBySource.length;
  if (totalSources === 0) return [];

  // Calculate how many results to take from each source
  const resultsPerSource = Math.ceil(maxResults / totalSources);

  // Take top N results from each source
  const distributedResults = resultsBySource.flatMap(({ results }) =>
    results.slice(0, resultsPerSource)
  );

  // If we have more than maxResults, take the top maxResults by score
  if (distributedResults.length > maxResults) {
    return sortResults(distributedResults, "relevance").slice(0, maxResults);
  }

  return distributedResults;
}

// ============================================================
// Main Discovery Action
// ============================================================

export interface DiscoverArgs {
  query: string;
  sourceTypes: string[];
  timeRange?: string;
  academicFilters?: {
    publicationYearFrom?: number;
    publicationYearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
    hasFullText?: boolean;
  };
  maxResults: number;
  sortBy?: string;
}

export type RunActionFn = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

export async function discoverHandler(
  args: DiscoverArgs,
  runAction: RunActionFn
): Promise<{
  sources: UnifiedDiscoveryResult[];
  totalCount: number;
  sourceTypeCounts: Record<string, number>;
}> {
  const {
    query,
    sourceTypes,
    timeRange,
    academicFilters,
    maxResults,
    sortBy = "relevance",
  } = args;

  const logger = createServiceLogger("discovery", "discover");
  const startTime = Date.now();

  // Determine which source types to search
  const searchWeb = sourceTypes.includes("web");
  const searchNews = sourceTypes.includes("news");
  const searchFinance = sourceTypes.includes("finance");
  const searchAcademic = sourceTypes.includes("academic");

  const webTopics: Array<"web" | "news" | "finance"> = [];
  if (searchWeb) webTopics.push("web");
  if (searchNews) webTopics.push("news");
  if (searchFinance) webTopics.push("finance");

  const numSearchChannels = webTopics.length + (searchAcademic ? 1 : 0);
  const maxPerChannel =
    numSearchChannels > 0 ? Math.ceil(maxResults / numSearchChannels) : maxResults;

  logger.operationStart({
    sourceTypes: sourceTypes.join(","),
    maxResults,
    maxPerChannel,
    sortBy,
    queryLen: query.length,
  });

  // Prepare search promises for parallel execution with timing
  const searchPromises: Promise<{
    sourceType: string;
    results: UnifiedDiscoveryResult[];
    duration: number;
  }>[] = [];

  // For each web topic, create a search promise with timing
  for (const topic of webTopics) {
    const tavilyTopic = topic === "web" ? "general" : topic;
    const topicStartTime = Date.now();

    const promise = runAction(
      internal._services.search.TavilySearchService.discoverSourcesInternal,
      {
        query,
        maxResults: maxPerChannel,
        topic: tavilyTopic,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        timeRange: timeRange as any,
      }
    )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((results: any) => {
        const duration = Date.now() - topicStartTime;
        logger.info(`${topic.toUpperCase()} search completed`, {
          durationMs: duration,
          resultCount: results.length,
        });
        return {
          sourceType: topic,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Academic search with timing
  if (searchAcademic) {
    const academicStartTime = Date.now();

    const promise = runAction(
      internal._services.search.AcademicSearchService.discoverAcademicPapersInternal,
      {
        query,
        maxResults: maxPerChannel,
        publicationYearFrom: academicFilters?.publicationYearFrom,
        publicationYearTo: academicFilters?.publicationYearTo,
        minCitations: academicFilters?.minCitations,
        openAccessOnly: academicFilters?.openAccessOnly,
        hasFullText: academicFilters?.hasFullText,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sortBy: sortBy as any,
      }
    )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((results: any) => {
        const duration = Date.now() - academicStartTime;
        logger.info("ACADEMIC search completed", {
          durationMs: duration,
          resultCount: results.length,
        });
        return {
          sourceType: "academic",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Execute all searches in parallel
  const searchResults = await Promise.all(searchPromises);

  // Log performance summary
  const totalDuration = Date.now() - startTime;
  const successCount = searchResults.filter((r) => r.results.length > 0).length;
  const totalRawResults = searchResults.reduce((sum, r) => sum + r.results.length, 0);

  logger.performance("discovery_parallel_total_ms", totalDuration, "ms", {
    sourceCount: searchResults.length,
    successCount,
    totalRawResults,
  });
  logger.info("Source performance", {
    breakdown: searchResults.map((r) => `${r.sourceType}:${r.duration}ms:${r.results.length}`),
  });

  // Distribute results evenly across sources
  let finalResults = distributeResults(searchResults, maxResults);

  // Sort results according to user preference
  finalResults = sortResults(finalResults, sortBy as "relevance" | "date" | "citations");

  const finalDuration = Date.now() - startTime;
  logger.operationComplete({
    finalCount: finalResults.length,
    durationMs: finalDuration,
  });

  return {
    sources: finalResults,
    totalCount: finalResults.length,
    sourceTypeCounts: searchResults.reduce(
      (acc, { sourceType, results }) => {
        acc[sourceType] = Math.min(results.length, maxPerChannel);
        return acc;
      },
      {} as Record<string, number>
    ),
  };
}

/**
 * Unified discovery service that searches across multiple source types
 * Routes to Tavily for web/news/finance and Academic APIs for academic papers
 * Results are normalized, merged, and sorted according to preferences
 */
export const discover = action({
  args: {
    query: v.string(),
    sourceTypes: v.array(v.string()),
    timeRange: v.optional(v.string()),
    academicFilters: v.optional(
      v.object({
        publicationYearFrom: v.optional(v.number()),
        publicationYearTo: v.optional(v.number()),
        minCitations: v.optional(v.number()),
        openAccessOnly: v.optional(v.boolean()),
        hasFullText: v.optional(v.boolean()),
      })
    ),
    maxResults: v.number(),
    sortBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    return discoverHandler(args, (action, actionArgs) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx.runAction as any)(action, actionArgs)
    );
  },
});

/**
 * Simplified discovery action for backward compatibility
 * Defaults to web sources only
 */

export interface DiscoverSourcesArgs {
  query: string;
  maxResults?: number;
  scoreThreshold?: number;
}

export async function discoverSourcesHandler(
  args: DiscoverSourcesArgs,
  runAction: RunActionFn
): Promise<{
  sources: Array<{ title: string; url: string; snippet: string; score: number }>;
}> {
  const result = await runAction(
    internal._services.search.TavilySearchService.discoverSourcesInternal,
    {
      query: args.query,
      maxResults: args.maxResults ?? 10,
    }
  );

  return result;
}

export const discoverSources = action({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
    scoreThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    return discoverSourcesHandler(args, (action, actionArgs) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx.runAction as any)(action, actionArgs)
    );
  },
});

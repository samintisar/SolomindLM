"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";

/**
 * Unified discovery result format
 * Normalizes results from different APIs (Tavily, OpenAlex)
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
  maxResults: number;
  sortBy?: "relevance" | "date" | "citations";
}

/**
 * Normalize scores from different APIs to a common scale
 * Tavily scores: 0-1 (mostly 0.6-1.0)
 * OpenAlex scores: 0-1 (calculated from citations + recency)
 */
function normalizeScore(score: number, sourceType: string): number {
  // Scores are already normalized to 0-1 range from both APIs
  return Math.min(Math.max(score, 0), 1);
}

/**
 * Convert relevance score to label
 */
function getRelevanceLabel(score: number): "high" | "medium" | "low" {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

/**
 * Transform Tavily result to unified format
 */
function transformTavilyResult(
  result: any,
  sourceType: "web" | "news" | "finance"
): UnifiedDiscoveryResult {
  return {
    id: `tavily-${sourceType}-${result.url}`,
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
 * Transform OpenAlex result to unified format
 */
function transformOpenAlexResult(result: any): UnifiedDiscoveryResult {
  return {
    id: result.id,
    title: result.title,
    url: result.url,
    snippet: result.snippet,
    score: normalizeScore(result.score, "academic"),
    sourceType: "academic",
    publishedDate: result.publishedDate,
    metadata: {
      authors: result.authors,
      venue: result.venue,
      citationCount: result.citationCount,
      openAccess: result.openAccess,
      hasFullText: result.hasFullText,
      publicationYear: result.publicationYear,
      type: result.type,
    },
  };
}

/**
 * Sort results based on sort option
 */
function sortResults(
  results: UnifiedDiscoveryResult[],
  sortBy: "relevance" | "date" | "citations"
): UnifiedDiscoveryResult[] {
  switch (sortBy) {
    case "date":
      return results.sort((a, b) => {
        if (!a.publishedDate && !b.publishedDate) return b.score - a.score;
        if (!a.publishedDate) return 1;
        if (!b.publishedDate) return -1;
        return new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime();
      });
    case "citations":
      return results.sort((a, b) => {
        const aCitations = a.metadata.citationCount || 0;
        const bCitations = b.metadata.citationCount || 0;
        return bCitations - aCitations;
      });
    case "relevance":
    default:
      return results.sort((a, b) => b.score - a.score);
  }
}

/**
 * Distribute results evenly across source types when multiple are selected
 */
function distributeResults(
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

/**
 * Unified discovery service that searches across multiple source types
 * Routes to Tavily for web/news/finance and OpenAlex for academic papers
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
    const {
      query,
      sourceTypes,
      timeRange,
      academicFilters,
      maxResults,
      sortBy = "relevance",
    } = args;

    const userId = await getAuthUserId(ctx);
    const logger = createServiceLogger("discovery", "discover", {
      userId: userId ?? undefined,
    });
    const startTime = Date.now();
    logger.operationStart({
      sourceTypes: sourceTypes.join(","),
      maxResults,
      sortBy,
      queryLen: query.length,
    });

    // Determine which source types to search
    const searchWeb = sourceTypes.includes("web");
    const searchNews = sourceTypes.includes("news");
    const searchFinance = sourceTypes.includes("finance");
    const searchAcademic = sourceTypes.includes("academic");

    // Prepare search promises for parallel execution with timing
    const searchPromises: Promise<{
      sourceType: string;
      results: UnifiedDiscoveryResult[];
      duration: number;
    }>[] = [];

    // Tavily searches (web, news, finance)
    const tavilyTopics: Array<"web" | "news" | "finance"> = [];
    if (searchWeb) tavilyTopics.push("web");
    if (searchNews) tavilyTopics.push("news");
    if (searchFinance) tavilyTopics.push("finance");

    // For each Tavily topic, create a search promise with timing
    for (const topic of tavilyTopics) {
      const tavilyTopic = topic === "web" ? "general" : topic;
      const topicStartTime = Date.now();

      const promise = (ctx.runAction as any)(
        internal._services.search.TavilySearchService.discoverSourcesInternal,
        {
          query,
          maxResults: maxResults,
          topic: tavilyTopic,
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
            results: results.map((r: any) => transformTavilyResult(r, topic)),
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

    // OpenAlex search (academic) with timing
    if (searchAcademic) {
      const academicStartTime = Date.now();

      const promise = (ctx.runAction as any)(
        internal._services.search.OpenAlexSearchService.discoverAcademicPapersInternal,
        {
          query,
          maxResults: maxResults,
          publicationYearFrom: academicFilters?.publicationYearFrom,
          publicationYearTo: academicFilters?.publicationYearTo,
          minCitations: academicFilters?.minCitations,
          openAccessOnly: academicFilters?.openAccessOnly,
          hasFullText: academicFilters?.hasFullText,
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
            results: results.map((r: any) => transformOpenAlexResult(r)),
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
          acc[sourceType] = Math.min(results.length, Math.ceil(maxResults / searchResults.length));
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  },
});

/**
 * Simplified discovery action for backward compatibility
 * Defaults to web sources only
 */
export const discoverSources = action({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
    scoreThreshold: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    sources: Array<{ title: string; url: string; snippet: string; score: number }>;
  }> => {
    const result = await (ctx.runAction as any)(
      internal._services.search.TavilySearchService.discoverSourcesInternal,
      {
        query: args.query,
        maxResults: args.maxResults ?? 10,
      }
    );

    return result;
  },
});

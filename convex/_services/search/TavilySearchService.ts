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
 * Source discovery result from Tavily
 */
export interface DiscoveredSource {
  title: string;
  url: string;
  snippet: string;
  score: number;
  publishedDate?: string;
  domain?: string;
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
    const logger = createServiceLogger("tavily", "searchInternal");
    const startTime = Date.now();
    logger.operationStart({
      queryLen: query.length,
      topic: topic || "general",
      timeRange: timeRange ?? null,
      maxResults,
    });

    const apiKey = env.TAVILY_API_KEY;
    if (!apiKey) {
      logger.error("TAVILY_API_KEY is not configured");
      throw new Error("TAVILY_API_KEY is not configured");
    }

    try {
      const data = await invokeWithHttpRetry(async () => {
        const t0 = Date.now();
        logger.apiCall("tavily", "/search", {
          topic: topic || "general",
          maxResults,
        });
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: searchDepth || "basic",
            topic: topic || "general",
            time_range: timeRange,
            include_answer: false,
            include_raw_content: false,
            max_results: maxResults,
            exclude_domains:
              excludeDomains && excludeDomains.length > 0 ? excludeDomains : undefined,
            include_domains:
              includeDomains && includeDomains.length > 0 ? includeDomains : undefined,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.apiError("tavily", "/search", new Error(`HTTP ${response.status}`), {
            topic,
            timeRange,
          });
          throw createExternalServiceErrorFromResponse(
            "tavily",
            response.status,
            "/search",
            errorText.slice(0, 500)
          );
        }

        logger.apiSuccess("tavily", "/search", Date.now() - t0, { maxResults });
        return (await response.json()) as { results?: any[] };
      }, "tavily_search");

      let sources: DiscoveredSource[] = (data.results || []).map((result: any) => ({
        title: result.title || "Untitled",
        url: result.url,
        snippet: result.content || "",
        score: result.score || 0,
        publishedDate: result.published_date,
        domain: result.url ? new URL(result.url).hostname : undefined,
      }));

      sources = sources.filter((source) => source.score >= scoreThreshold);
      sources.sort((a, b) => b.score - a.score);

      logger.operationComplete({ count: sources.length, durationMs: Date.now() - startTime });
      return sources;
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
  internal._services.search.TavilySearchService.searchInternal,
  { ttl: withJitter(CACHE_TTL.search, 0.15), name: "tavily-search" }
);

/**
 * Normalize query for better cache hits
 * - Lowercase
 * - Trim whitespace
 * - Normalize multiple spaces to single space
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

// ============================================================
// Public Cached Action
// ============================================================

/**
 * Discover web sources using Tavily Search API with caching (internal version)
 * This action is cached to reduce API costs and improve latency
 */
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
    const logger = createServiceLogger("tavily", "discoverSourcesInternal");
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

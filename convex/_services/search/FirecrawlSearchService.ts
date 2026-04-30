"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { createCachedAction } from "../cache/cachedAgent";
import { CACHE_TTL, withJitter } from "../cache/cache";
import { internal } from "../../_generated/api";
import { env } from "../../_lib/env";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
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
}

// ============================================================
// Internal Action (makes actual API call)
// ============================================================

export const searchInternal = internalAction({
  args: {
    query: v.string(),
    maxResults: v.number(),
    scoreThreshold: v.number(),
    topic: v.optional(v.string()),
    timeRange: v.optional(v.string()),
  },
  handler: async (
    _,
    {
      query,
      maxResults,
      scoreThreshold,
      topic,
      timeRange,
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
    const sources = topic === "news" ? (["news"] as ("news")[]) : undefined;

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
    topic: v.optional(v.string()),
    timeRange: v.optional(v.string()),
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
        topic: args.topic,
        timeRange: args.timeRange,
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

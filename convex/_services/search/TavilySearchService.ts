"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { createCachedAction } from "../cache/cachedAgent";
import { CACHE_TTL, withJitter } from "../cache/cache";
import { internal } from "../../_generated/api";
import { env } from "../../_lib/env";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import { createExternalServiceErrorFromResponse } from "../../_lib/errors";

import { tavily } from "@tavily/core";

let _tavilyClient: ReturnType<typeof tavily> | null = null;
function getTavilyClient(): ReturnType<typeof tavily> {
  if (!_tavilyClient) {
    const apiKey = env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("TAVILY_API_KEY is not configured");
    _tavilyClient = tavily({ apiKey });
  }
  return _tavilyClient;
}

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
  /** Full page content in markdown (when include_raw_content is enabled) */
  rawContent?: string;
}

// ============================================================
// Internal Action (makes actual API call)
// ============================================================

export interface SearchInternalArgs {
  query: string;
  maxResults: number;
  scoreThreshold: number;
  topic?: string;
  timeRange?: string;
  searchDepth?: string;
  includeRawContent?: boolean;
  excludeDomains?: string[];
  includeDomains?: string[];
}

export async function searchInternalHandler(args: SearchInternalArgs): Promise<DiscoveredSource[]> {
  const {
    query,
    maxResults,
    scoreThreshold,
    topic,
    timeRange,
    searchDepth,
    includeRawContent,
    excludeDomains,
    includeDomains,
  } = args;

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

      const response = await getTavilyClient().search(query, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        searchDepth: (searchDepth || "basic") as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        topic: (topic || "general") as any,
        maxResults,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        timeRange: timeRange as any,
        includeAnswer: false,
        includeRawContent: includeRawContent ? "markdown" : false,
        includeImages: false,
        includeImageDescriptions: false,
        includeFavicon: false,
        ...(excludeDomains && excludeDomains.length > 0 ? { excludeDomains } : {}),
        ...(includeDomains && includeDomains.length > 0 ? { includeDomains } : {}),
      });

      logger.apiSuccess("tavily", "/search", Date.now() - t0, { maxResults });
      return response;
    }, "tavily_search");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sources: DiscoveredSource[] = (data.results || []).map((result: any) => ({
      title: result.title || "Untitled",
      url: result.url,
      snippet: result.content || "",
      score: result.score || 0,
      publishedDate: result.published_date,
      domain: result.url ? new URL(result.url).hostname : undefined,
      rawContent: result.rawContent || undefined,
    }));

    sources = sources.filter((source) => source.score >= scoreThreshold);
    sources.sort((a, b) => b.score - a.score);

    logger.operationComplete({
      count: sources.length,
      durationMs: Date.now() - startTime,
    });
    return sources;
  } catch (error) {
    logger.operationError(error);
    if (error instanceof Error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = error as any;
      const httpStatus =
        e.statusCode ?? e.status ?? e.response?.statusCode ?? e.response?.status ?? 0;
      throw createExternalServiceErrorFromResponse(
        "tavily",
        typeof httpStatus === "number" ? httpStatus : 0,
        "/search",
        error.message
      );
    }
    throw error;
  }
}

export const searchInternal = internalAction({
  args: {
    query: v.string(),
    maxResults: v.number(),
    scoreThreshold: v.number(),
    topic: v.optional(v.string()),
    timeRange: v.optional(v.string()),
    searchDepth: v.optional(v.string()),
    includeRawContent: v.optional(v.boolean()),
    excludeDomains: v.optional(v.array(v.string())),
    includeDomains: v.optional(v.array(v.string())),
  },
  handler: async (_, args) => searchInternalHandler(args),
});

// ============================================================
// Cached Wrapper
// ============================================================

const searchCache = createCachedAction(
  internal._services.search.TavilySearchService.searchInternal,
  { ttl: withJitter(CACHE_TTL.search, 0.15), name: "tavily-search" }
);

export function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

// ============================================================
// Public Cached Action
// ============================================================

export interface DiscoverSourcesArgs {
  query: string;
  maxResults?: number;
  scoreThreshold?: number;
  topic?: string;
  timeRange?: string;
  searchDepth?: string;
  includeRawContent?: boolean;
  excludeDomains?: string[];
  includeDomains?: string[];
}

export async function discoverSourcesInternalHandler(
  args: DiscoverSourcesArgs
): Promise<DiscoveredSource[]> {
  const logger = createServiceLogger("tavily", "discoverSourcesInternal");
  const startTime = Date.now();
  const normalizedQuery = normalizeQuery(args.query);

  logger.operationStart({
    queryPreview: normalizedQuery.substring(0, 50),
    topic: args.topic || "general",
    timeRange: args.timeRange ?? null,
  });

  const result = await searchInternalHandler({
    query: normalizedQuery,
    maxResults: args.maxResults ?? 10,
    scoreThreshold: args.scoreThreshold ?? 0.5,
    topic: args.topic,
    timeRange: args.timeRange,
    searchDepth: args.searchDepth,
    includeRawContent: args.includeRawContent,
    excludeDomains: args.excludeDomains,
    includeDomains: args.includeDomains,
  });

  logger.operationComplete({
    count: result.length,
    durationMs: Date.now() - startTime,
  });
  return result;
}

export const discoverSourcesInternal = internalAction({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
    scoreThreshold: v.optional(v.number()),
    topic: v.optional(v.string()),
    timeRange: v.optional(v.string()),
    searchDepth: v.optional(v.string()),
    includeRawContent: v.optional(v.boolean()),
    excludeDomains: v.optional(v.array(v.string())),
    includeDomains: v.optional(v.array(v.string())),
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
        topic: args.topic,
        timeRange: args.timeRange,
        searchDepth: args.searchDepth,
        includeRawContent: args.includeRawContent,
        excludeDomains: args.excludeDomains,
        includeDomains: args.includeDomains,
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

// ============================================================
// Extract Internal Action
// ============================================================

export interface ExtractInternalArgs {
  urls: string[];
  extractDepth?: "basic" | "advanced";
  format?: "markdown" | "text";
}

export async function extractInternalHandler(
  args: ExtractInternalArgs
): Promise<{ results: Array<{ url: string; title: string | null; rawContent: string }>; failedResults: Array<{ url: string; error: string }> }> {
  const logger = createServiceLogger("tavily", "extractInternal");
  const startTime = Date.now();
  logger.operationStart({ urlCount: args.urls.length });

  try {
    const data = await invokeWithHttpRetry(async () => {
      const t0 = Date.now();
      logger.apiCall("tavily", "/extract", { urlCount: args.urls.length });

      const response = await getTavilyClient().extract(args.urls, {
        extractDepth: args.extractDepth ?? "advanced",
        format: args.format ?? "markdown",
        timeout: 30,
      });

      logger.apiSuccess("tavily", "/extract", Date.now() - t0, {
        successCount: response.results.length,
        failedCount: response.failedResults.length,
      });
      return response;
    }, "tavily_extract");

    logger.operationComplete({
      successCount: data.results.length,
      failedCount: data.failedResults.length,
      durationMs: Date.now() - startTime,
    });

    return {
      results: data.results.map((r) => ({
        url: r.url,
        title: r.title,
        rawContent: r.rawContent,
      })),
      failedResults: data.failedResults.map((f) => ({
        url: f.url,
        error: f.error,
      })),
    };
  } catch (error) {
    logger.operationError(error);
    if (error instanceof Error) {
      const e = error as any;
      const httpStatus =
        e.statusCode ?? e.status ?? e.response?.statusCode ?? e.response?.status ?? 0;
      throw createExternalServiceErrorFromResponse(
        "tavily",
        typeof httpStatus === "number" ? httpStatus : 0,
        "/extract",
        error.message
      );
    }
    throw error;
  }
}

export const extractInternal = internalAction({
  args: {
    urls: v.array(v.string()),
    extractDepth: v.optional(v.union(v.literal("basic"), v.literal("advanced"))),
    format: v.optional(v.union(v.literal("markdown"), v.literal("text"))),
  },
  handler: async (_ctx, args) => extractInternalHandler(args),
});

// ============================================================
// Cached Wrapper
// ============================================================

const extractCache = createCachedAction(
  internal._services.search.TavilySearchService.extractInternal,
  { ttl: withJitter(CACHE_TTL.documentContent, 0.15), name: "tavily-extract" }
);

// ============================================================
// Public Cached Action
// ============================================================

export interface ExtractContentArgs {
  urls: string[];
  extractDepth?: "basic" | "advanced";
  format?: "markdown" | "text";
}

export async function extractContentInternalHandler(
  ctx: any,
  args: ExtractContentArgs
): Promise<{ results: Array<{ url: string; title: string | null; rawContent: string }>; failedResults: Array<{ url: string; error: string }> }> {
  const logger = createServiceLogger("tavily", "extractContentInternal");
  const startTime = Date.now();

  logger.operationStart({ urlCount: args.urls.length });

  try {
    const result = await extractCache.fetch(ctx, {
      urls: args.urls,
      extractDepth: args.extractDepth,
      format: args.format,
    });

    logger.operationComplete({
      successCount: result.results.length,
      failedCount: result.failedResults.length,
      durationMs: Date.now() - startTime,
    });
    return result;
  } catch (error) {
    logger.operationError(error);
    throw error;
  }
}

export const extractContentInternal = internalAction({
  args: {
    urls: v.array(v.string()),
    extractDepth: v.optional(v.union(v.literal("basic"), v.literal("advanced"))),
    format: v.optional(v.union(v.literal("markdown"), v.literal("text"))),
  },
  handler: async (ctx, args) => extractContentInternalHandler(ctx, args),
});

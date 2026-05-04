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

const tavilyClient = tavily({ apiKey: env.TAVILY_API_KEY });

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
  excludeDomains?: string[];
  includeDomains?: string[];
}

export async function searchInternalHandler(
  args: SearchInternalArgs
): Promise<DiscoveredSource[]> {
  const {
    query,
    maxResults,
    scoreThreshold,
    topic,
    timeRange,
    searchDepth,
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

      const response = await tavilyClient.search(query, {
        searchDepth: (searchDepth || "basic") as any,
        topic: (topic || "general") as any,
        maxResults,
        timeRange: timeRange as any,
        includeAnswer: false,
        includeRawContent: "markdown",
        includeImages: false,
        includeImageDescriptions: false,
        includeFavicon: false,
        ...(excludeDomains && excludeDomains.length > 0
          ? { excludeDomains }
          : {}),
        ...(includeDomains && includeDomains.length > 0
          ? { includeDomains }
          : {}),
      });

      logger.apiSuccess("tavily", "/search", Date.now() - t0, { maxResults });
      return response;
    }, "tavily_search");

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
      throw createExternalServiceErrorFromResponse(
        "tavily",
        0,
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

  try {
    const result = await searchInternalHandler({
      query: normalizedQuery,
      maxResults: args.maxResults ?? 10,
      scoreThreshold: args.scoreThreshold ?? 0.5,
      topic: args.topic,
      timeRange: args.timeRange,
      searchDepth: args.searchDepth,
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
}

export const discoverSourcesInternal = internalAction({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
    scoreThreshold: v.optional(v.number()),
    topic: v.optional(v.string()),
    timeRange: v.optional(v.string()),
    searchDepth: v.optional(v.string()),
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
// Deep Research
// ============================================================

export interface DeepResearchArgs {
  input: string;
  model?: "mini" | "pro" | "auto";
  outputSchema?: Record<string, unknown>;
}

export interface DeepResearchResult {
  requestId: string;
  status: string;
  content?: string;
  sources?: Array<{ url: string; title: string }>;
}

export async function deepResearchHandler(
  args: DeepResearchArgs
): Promise<DeepResearchResult> {
  const { input, model = "auto" } = args;
  const logger = createServiceLogger("tavily", "deepResearch");
  logger.operationStart({ inputPreview: input.substring(0, 100), model });

  const apiKey = env.TAVILY_API_KEY;
  if (!apiKey) {
    logger.error("TAVILY_API_KEY is not configured");
    throw new Error("TAVILY_API_KEY is not configured");
  }

  try {
      // Step 1: Start research task
      const startResult = await tavilyClient.research(input, {
      model,
      ...(args.outputSchema ? { outputSchema: args.outputSchema } : {}),
    });

    // Handle both generator and direct response types
    if (typeof (startResult as any).next === 'function') {
      throw new Error("Streaming research not supported in eval mode");
    }
    const researchResponse = startResult as { requestId: string };
    const requestId = researchResponse.requestId;
    logger.info("Deep research started", { requestId, model });

    // Step 2: Poll until completed
      let response = await tavilyClient.getResearch(requestId);
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes at 5s intervals

    while (
      response.status !== "completed" &&
      response.status !== "failed" &&
      attempts < maxAttempts
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      response = await tavilyClient.getResearch(requestId);
      attempts++;
      logger.debug("Polling research", {
        requestId,
        status: response.status,
        attempt: attempts,
      });
    }

    if (response.status === "failed") {
      const failedResponse = response as { error?: string };
      const errorMsg = failedResponse.error || "Deep research task failed";
      logger.error("Deep research failed", new Error(errorMsg), {
        requestId,
      });
      throw new Error(errorMsg);
    }

    if (attempts >= maxAttempts) {
      logger.error(
        "Deep research timed out",
        new Error("Max polling attempts exceeded"),
        { requestId }
      );
      throw new Error("Deep research timed out after 10 minutes");
    }

    const completedResponse = response as { content?: string; sources?: Array<{ title: string; url: string }> };

    logger.operationComplete({
      requestId,
      contentLength: completedResponse.content?.length || 0,
      sourceCount: completedResponse.sources?.length || 0,
    });

    return {
      requestId,
      status: response.status,
      content: completedResponse.content,
      sources: completedResponse.sources,
    };
  } catch (error) {
    logger.operationError(error);
    throw error;
  }
}

export const deepResearch = internalAction({
  args: {
    input: v.string(),
    model: v.optional(v.string()),
    outputSchema: v.optional(v.any()),
  },
  handler: async (_, args) =>
    deepResearchHandler({
      input: args.input,
      model: (args.model as any) || "auto",
      outputSchema: args.outputSchema,
    }),
});

"use node";

/**
 * Cached Voyage AI Reranking Service
 *
 * Provides a cached wrapper around the Voyage rerank API.
 * @convex-dev/action-cache hashes the full `query` string and all `documents` bodies — cache invalidates when content changes.
 */

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { env } from "../../_lib/env";
import { RERANK_ACTION_BACKSTOP_MS, RERANK_MODEL } from "../../_lib/rerankConfig";
import { callVoyageRerank } from "../../_services/ai/voyageRerank";
import { CACHE_TTL, withJitter } from "../../_services/cache/cache";
import { createCachedAction } from "../../_services/cache/cachedAgent";
import { withTimeout } from "./withTimeout.js";

// ============================================================
// Types
// ============================================================

export interface RerankResult {
  id: string;
  content: string;
  score?: number;
}

export interface RerankDocument {
  id: string;
  content: string;
}

// ============================================================
// Internal Action (makes actual API call)
// ============================================================

export const rerankInternal = internalAction({
  args: {
    query: v.string(),
    documents: v.array(v.string()),
    topN: v.number(),
  },
  handler: async (_, { query, documents, topN }) => {
    console.log(
      `[RerankInternal] query="${query.slice(0, 50)}...", docs=${documents.length}, model=${RERANK_MODEL}, topN=${topN}`
    );

    const apiKey = env.VOYAGE_API_KEY;
    if (!apiKey) {
      console.error("[RerankInternal] VOYAGE_API_KEY is not configured");
      throw new Error("VOYAGE_API_KEY is not configured");
    }

    try {
      // Hits carry the index into `documents` so callers can map back to their own ids.
      const results = await callVoyageRerank(query, documents, apiKey, topN);
      console.log("[RerankInternal] Results count:", results.length);
      return results;
    } catch (error) {
      console.error("[RerankInternal] Error:", error);
      throw error;
    }
  },
});

// ============================================================
// Cached Wrapper
// ============================================================

const rerankCache = createCachedAction(internal._agents.chat.rerankCache.rerankInternal, {
  ttl: withJitter(CACHE_TTL.rerank, 0.2),
  // Bumped from "rerank-v2" (ZeroEntropy) so no entry scored by the old model is served
  // after the switch to Voyage.
  name: "rerank-v3-voyage",
});

// ============================================================
// Public Functions
// ============================================================

/**
 * Normalize query for cache consistency
 * Lowercase, trim whitespace, collapse multiple spaces
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Cached reranking function with ID-based cache keys
 *
 * @param ctx - Convex context
 * @param query - Search query
 * @param documents - Documents to rerank (with id and content)
 * @param topN - Number of top results to return
 * @returns Reranked results with original document IDs preserved
 */
export async function cachedRerank(
  ctx: any,
  query: string,
  documents: RerankDocument[],
  topN: number = 15
): Promise<RerankResult[]> {
  if (documents.length === 0) {
    return [];
  }

  // Normalize query BEFORE cache lookup for better cache hit rate
  const normalizedQuery = normalizeQuery(query);

  // Log normalization for debugging
  if (query !== normalizedQuery) {
    console.log(`[RerankCache] Normalized: "${query}" → "${normalizedQuery}"`);
  }

  // Sort by CONTENT (not ID) for cache key stability
  // Same content = cache hit, regardless of document ID
  const sortedDocs = [...documents].sort((a, b) => a.content.localeCompare(b.content));

  // Build cache key components (for logging/debugging)
  const docIds = sortedDocs.map((d) => d.id).join(",");
  console.log(`[RerankCache] key: model=${RERANK_MODEL}, docs=${docIds.slice(0, 50)}...`);

  // Call cached action with NORMALIZED query and documents content. The extra second lets the
  // action's own client timeout surface its error first; this is the backstop for a stalled action.
  const results = await withTimeout(
    rerankCache.fetch(ctx, {
      query: normalizedQuery,
      documents: sortedDocs.map((d) => d.content),
      topN,
    }),
    RERANK_ACTION_BACKSTOP_MS,
    "rerank"
  );

  // Handle null/undefined results
  if (!results || !Array.isArray(results)) {
    console.error("[RerankCache] Invalid results from cache:", typeof results, results);
    throw new Error("Reranking returned invalid results");
  }

  console.log(`[RerankCache] Got ${results.length} results from cache`);

  // Map results back to original document IDs
  const resultMap = new Map(sortedDocs.map((d, i) => [i, d]));
  const reranked: RerankResult[] = [];

  for (const item of results) {
    const originalDoc = resultMap.get(item.index);
    if (originalDoc) {
      reranked.push({
        id: originalDoc.id,
        content: originalDoc.content,
        score: item.relevance_score,
      });
    }
  }

  // Add any documents not in reranked results (preserving original order)
  const rerankedIds = new Set(reranked.map((r) => r.id));
  for (const doc of documents) {
    if (!rerankedIds.has(doc.id)) {
      reranked.push({
        id: doc.id,
        content: doc.content,
      });
    }
  }

  return reranked;
}

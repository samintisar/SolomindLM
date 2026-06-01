"use node";

/**
 * Cached ZeroEntropy Reranking Service
 *
 * Provides a cached wrapper around ZeroEntropy reranking API.
 * @convex-dev/action-cache hashes the full `query` string and all `documents` bodies — cache invalidates when content changes.
 */

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { env } from "../../_lib/env";
import { CACHE_TTL, withJitter } from "../../_services/cache/cache";
import { hashInput } from "../../_services/cache/cacheCrypto";
import { createCachedAction } from "../../_services/cache/cachedAgent";

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
    model: v.string(),
    topN: v.number(),
  },
  handler: async (_, { query, documents, model, topN }) => {
    console.log("[RerankInternal] Starting reranking...");
    console.log(
      `[RerankInternal] query="${query.slice(0, 50)}...", docs=${documents.length}, model=${model}, topN=${topN}`
    );

    const apiKey = env.ZEROENTROPY_API_KEY;
    if (!apiKey) {
      console.error("[RerankInternal] ZEROENTROPY_API_KEY is not configured");
      throw new Error("ZEROENTROPY_API_KEY is not configured");
    }

    try {
      const { ZeroEntropy } = await import("zeroentropy");
      const zclient = new ZeroEntropy({ apiKey });

      const response = await zclient.models.rerank({
        model,
        query,
        documents,
        top_n: topN,
      });

      console.log("[RerankInternal] ZeroEntropy response:", JSON.stringify(response).slice(0, 500));
      console.log("[RerankInternal] Results count:", response.results?.length ?? 0);

      // Return results with indices for mapping back to original documents
      const results = (response.results || []).map((item: any) => ({
        index: item.index ?? item.document_index ?? 0,
        text: item.text ?? item.document,
        relevance_score: item.relevance_score,
      }));

      console.log("[RerankInternal] Mapped results:", results.length);
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
  name: "rerank-v2",
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
 * @param model - ZeroEntropy model to use
 * @param topN - Number of top results to return
 * @returns Reranked results with original document IDs preserved
 */
export async function cachedRerank(
  ctx: any,
  query: string,
  documents: RerankDocument[],
  model: string = "zerank-2",
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
  const _contentHash = await hashInput(sortedDocs.map((d) => d.content).join("|"));
  const queryHash = await hashInput(normalizedQuery);
  console.log(
    `[RerankCache] key: model=${model}, queryHash=${queryHash}, docs=${docIds.slice(0, 50)}...`
  );

  // Call cached action with NORMALIZED query and documents content
  const results = await rerankCache.fetch(ctx, {
    query: normalizedQuery,
    documents: sortedDocs.map((d) => d.content),
    model,
    topN,
  });

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

/**
 * Check if reranking is available (API key configured)
 */
export function isRerankingAvailable(): boolean {
  return !!env.ZEROENTROPY_API_KEY;
}

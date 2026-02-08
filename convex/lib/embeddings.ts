"use node";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createCachedAction } from "./cachedAgent";
import { CACHE_TTL } from "./cache";

// ============================================================
// 1. Internal action that generates embeddings (cacheable)
// ============================================================
export const generateEmbeddingInternal = internalAction({
  args: { text: v.string() },
  handler: async (_, { text }): Promise<number[]> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  },
});

// ============================================================
// 2. Create cached version
// Note: Use internal.lib.embeddings since this file is in convex/lib/
// ============================================================
const embeddingCache = createCachedAction(
  internal.lib.embeddings.generateEmbeddingInternal,
  { ttl: CACHE_TTL.embedding, name: "embeddingsV1" }
);

// ============================================================
// 3. Public action that uses cache
// ============================================================
export const generateEmbedding = action({
  args: { text: v.string() },
  handler: async (ctx, args): Promise<number[]> => {
    // Normalize text to improve cache hit rate
    const normalizedText = args.text.trim();
    const result = await embeddingCache.fetch(ctx, { text: normalizedText });
    return result as number[];
  },
});

// ============================================================
// 4. Batch version (optimized with deduplication)
// ============================================================
export const generateEmbeddingsBatch = action({
  args: { texts: v.array(v.string()) },
  handler: async (ctx, args): Promise<number[][]> => {
    // Normalize texts to improve cache hit rate
    const normalizedTexts = args.texts.map((text) => text.trim());

    // Deduplicate texts to avoid redundant API calls
    const uniqueTexts = Array.from(new Set(normalizedTexts));

    // Create a map of text to index for reordering results
    const textToIndex = new Map<string, number[]>();
    normalizedTexts.forEach((text, idx) => {
      if (!textToIndex.has(text)) {
        textToIndex.set(text, []);
      }
      textToIndex.get(text)!.push(idx);
    });

    // Generate embeddings for unique texts only (cache coalescing)
    const uniqueResults = await Promise.all(
      uniqueTexts.map((text) => embeddingCache.fetch(ctx, { text }))
    );

    // Map results back to original order
    const results: number[][] = new Array(normalizedTexts.length);
    uniqueTexts.forEach((text, uniqueIdx) => {
      const originalIndices = textToIndex.get(text)!;
      const embedding = uniqueResults[uniqueIdx] as number[];
      originalIndices.forEach((idx) => {
        results[idx] = embedding;
      });
    });

    return results;
  },
});

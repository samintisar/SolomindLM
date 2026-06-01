"use node";
import { v } from "convex/values";
import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import { internal } from "../../_generated/api";
import { action, internalAction } from "../../_generated/server";
import {
  E5_EMBEDDING_MODEL,
  E5_TOGETHER_EMBED_BATCH_SIZE,
  type E5InputType,
  formatE5Input,
} from "../../_lib/e5Embedding";
import { createExternalServiceErrorFromResponse } from "../../_lib/errors";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { getAuthUserId } from "../../auth";
import { CACHE_TTL } from "../cache/cache";
import { createCachedAction } from "../cache/cachedAgent";

// ============================================================
// 1. Internal action that generates embeddings (cacheable)
// ============================================================
export const generateEmbeddingInternal = internalAction({
  args: {
    text: v.string(),
    inputType: v.optional(v.union(v.literal("query"), v.literal("passage"))),
  },
  handler: async (_, { text, inputType }): Promise<number[]> => {
    const mode: E5InputType = inputType ?? "passage";
    const logger = createServiceLogger("together-ai", "generateEmbeddingInternal");
    const apiKey = process.env.TOGETHER_AI_API_KEY;
    if (!apiKey) {
      logger.error("TOGETHER_AI_API_KEY is not set");
      throw new Error("TOGETHER_AI_API_KEY is not set");
    }

    const input = formatE5Input(mode, text);
    logger.operationStart({
      inputCharsRaw: text.length,
      inputCharsToApi: input.length,
      inputType: mode,
    });

    try {
      const embedding = await invokeWithHttpRetry(async () => {
        const t0 = Date.now();
        logger.apiCall("together-ai", "/v1/embeddings", {
          model: E5_EMBEDDING_MODEL,
          inputType: mode,
        });
        const response = await fetch("https://api.together.xyz/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: E5_EMBEDDING_MODEL,
            input,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          logger.apiError("together-ai", "/v1/embeddings", new Error(`HTTP ${response.status}`));
          throw createExternalServiceErrorFromResponse(
            "together-ai",
            response.status,
            "/v1/embeddings",
            errBody.slice(0, 400)
          );
        }

        const data = await response.json();
        logger.apiSuccess("together-ai", "/v1/embeddings", Date.now() - t0, {});
        return data.data[0].embedding as number[];
      }, "together_ai_embedding");

      logger.operationComplete({ dims: embedding.length });
      return embedding;
    } catch (error) {
      logger.operationError(error);
      throw error;
    }
  },
});

/**
 * Internal: multiple passages in a single Together embeddings request (array `input`).
 * Reduces bursty per-chunk calls and 429s vs Promise.all of {@link generateEmbeddingInternal}.
 */
export const generateEmbeddingsBatchInternal = internalAction({
  args: {
    texts: v.array(v.string()),
    inputType: v.optional(v.union(v.literal("query"), v.literal("passage"))),
  },
  handler: async (_, { texts, inputType }): Promise<number[][]> => {
    if (texts.length === 0) {
      return [];
    }

    const mode: E5InputType = inputType ?? "passage";
    const logger = createServiceLogger("together-ai", "generateEmbeddingsBatchInternal");
    const apiKey = process.env.TOGETHER_AI_API_KEY;
    if (!apiKey) {
      logger.error("TOGETHER_AI_API_KEY is not set");
      throw new Error("TOGETHER_AI_API_KEY is not set");
    }

    const inputs = texts.map((t) => formatE5Input(mode, t));
    logger.operationStart({
      batchSize: inputs.length,
      inputType: mode,
    });

    try {
      const vectors = await invokeWithHttpRetry(async () => {
        const t0 = Date.now();
        logger.apiCall("together-ai", "/v1/embeddings", {
          model: E5_EMBEDDING_MODEL,
          inputType: mode,
          batchSize: inputs.length,
        });
        const response = await fetch("https://api.together.xyz/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: E5_EMBEDDING_MODEL,
            input: inputs,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          logger.apiError("together-ai", "/v1/embeddings", new Error(`HTTP ${response.status}`));
          throw createExternalServiceErrorFromResponse(
            "together-ai",
            response.status,
            "/v1/embeddings",
            errBody.slice(0, 400)
          );
        }

        const data = (await response.json()) as {
          data: Array<{ index: number; embedding: number[] }>;
        };
        const items = data.data;
        if (!Array.isArray(items) || items.length !== inputs.length) {
          throw new Error(
            `embeddings API returned ${items?.length ?? 0} vectors, expected ${inputs.length}`
          );
        }
        const hasIndex = items.every((d) => typeof d.index === "number");
        const ordered = hasIndex ? [...items].sort((a, b) => a.index - b.index) : items;
        const embeddings = ordered.map((d) => d.embedding);
        logger.apiSuccess("together-ai", "/v1/embeddings", Date.now() - t0, {
          batchSize: inputs.length,
        });
        return embeddings;
      }, "together_ai_embedding");

      logger.operationComplete({ count: vectors.length, dims: vectors[0]?.length });
      return vectors;
    } catch (error) {
      logger.operationError(error);
      throw error;
    }
  },
});

// ============================================================
// 2. Create cached version
// Note: Use internal.lib.embeddings since this file is in convex/lib/
// ============================================================
const embeddingCache = createCachedAction(
  internal._services.ai.embeddings.generateEmbeddingInternal,
  { ttl: CACHE_TTL.embedding, name: "embeddingsV4-e5-900cap" }
);

// ============================================================
// 3. Public action that uses cache
// ============================================================
export const generateEmbedding = action({
  args: {
    text: v.string(),
    inputType: v.optional(v.union(v.literal("query"), v.literal("passage"))),
  },
  handler: async (ctx, args): Promise<number[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const normalizedText = args.text.trim();
    const inputType = args.inputType ?? "query";
    const result = await embeddingCache.fetch(ctx, { text: normalizedText, inputType });
    return result as number[];
  },
});

// ============================================================
// 4. Public: true Together batch API (array input) + deduplication
//     For a single string with caching, use `generateEmbedding` instead.
// ============================================================
export const generateEmbeddingsBatch = action({
  args: {
    texts: v.array(v.string()),
    inputType: v.optional(v.union(v.literal("query"), v.literal("passage"))),
  },
  handler: async (ctx, args): Promise<number[][]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const inputType = args.inputType ?? "passage";
    const normalizedTexts = args.texts.map((text) => text.trim());
    const uniqueTexts = Array.from(new Set(normalizedTexts));

    const textToIndex = new Map<string, number[]>();
    normalizedTexts.forEach((text, idx) => {
      if (!textToIndex.has(text)) {
        textToIndex.set(text, []);
      }
      textToIndex.get(text)!.push(idx);
    });

    const uniqueEmbeddings: number[][] = [];
    for (let off = 0; off < uniqueTexts.length; off += E5_TOGETHER_EMBED_BATCH_SIZE) {
      const batch = uniqueTexts.slice(off, off + E5_TOGETHER_EMBED_BATCH_SIZE);
      const part = await ctx.runAction(
        internal._services.ai.embeddings.generateEmbeddingsBatchInternal,
        { texts: batch, inputType }
      );
      uniqueEmbeddings.push(...part);
    }

    if (uniqueEmbeddings.length !== uniqueTexts.length) {
      throw new Error(
        `embeddings length mismatch: got ${uniqueEmbeddings.length}, expected ${uniqueTexts.length}`
      );
    }

    const results: number[][] = new Array(normalizedTexts.length);
    uniqueTexts.forEach((text, uniqueIdx) => {
      const originalIndices = textToIndex.get(text)!;
      const embedding = uniqueEmbeddings[uniqueIdx]!;
      originalIndices.forEach((idx) => {
        results[idx] = embedding;
      });
    });

    return results;
  },
});

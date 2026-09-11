"use node";

import { v } from "convex/values";
import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import { internal } from "../../_generated/api";
import { action, internalAction } from "../../_generated/server";
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "../../_lib/embeddingConfig";
import { createExternalServiceErrorFromResponse } from "../../_lib/errors";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { getAuthUserId } from "../../auth";
import { CACHE_TTL } from "../cache/cache";
import { createCachedAction } from "../cache/cachedAgent";

/**
 * The one implementation of "call OpenAI's embeddings endpoint." Everything
 * else in this file (the direct-use class and the cacheable Convex actions)
 * calls into this. Returns vectors in the same order as `inputs`.
 */
export async function callOpenAIEmbeddings(
  inputs: string[],
  apiKey: string
): Promise<number[][]> {
  if (inputs.length === 0) {
    return [];
  }

  return await invokeWithHttpRetry(async () => {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: inputs,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw createExternalServiceErrorFromResponse(
        "openai",
        response.status,
        "/v1/embeddings",
        errBody.slice(0, 400)
      );
    }

    const data = (await response.json()) as {
      data: Array<{ index: number; embedding: number[] }>;
    };
    if (!Array.isArray(data.data) || data.data.length !== inputs.length) {
      throw new Error(
        `embeddings API returned ${data.data?.length ?? 0} vectors, expected ${inputs.length}`
      );
    }
    return [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }, "openai_embedding");
}

/** Direct-use client for `"use node"` actions (chat, search, research, migrations). */
export class EmbeddingService {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async embedText(text: string): Promise<number[]> {
    const [vector] = await callOpenAIEmbeddings([text.trim()], this.apiKey);
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE).map((t) => t.trim());
      embeddings.push(...(await callOpenAIEmbeddings(batch, this.apiKey)));
    }
    return embeddings;
  }
}

// ============================================================
// Convex action layer — kept as real actions because
// @convex-dev/action-cache wraps a FunctionReference, not a
// plain function.
// ============================================================

export const generateEmbeddingInternal = internalAction({
  args: { text: v.string() },
  handler: async (_, { text }): Promise<number[]> => {
    const logger = createServiceLogger("openai", "generateEmbeddingInternal");
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error("OPENAI_API_KEY is not set");
      throw new Error("OPENAI_API_KEY is not set");
    }
    logger.operationStart({ inputChars: text.length });
    try {
      const [embedding] = await callOpenAIEmbeddings([text], apiKey);
      logger.operationComplete({ dims: embedding.length });
      return embedding;
    } catch (error) {
      logger.operationError(error);
      throw error;
    }
  },
});

export const generateEmbeddingsBatchInternal = internalAction({
  args: { texts: v.array(v.string()) },
  handler: async (_, { texts }): Promise<number[][]> => {
    if (texts.length === 0) {
      return [];
    }
    const logger = createServiceLogger("openai", "generateEmbeddingsBatchInternal");
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error("OPENAI_API_KEY is not set");
      throw new Error("OPENAI_API_KEY is not set");
    }
    logger.operationStart({ batchSize: texts.length });
    try {
      const vectors = await callOpenAIEmbeddings(texts, apiKey);
      logger.operationComplete({ count: vectors.length, dims: vectors[0]?.length });
      return vectors;
    } catch (error) {
      logger.operationError(error);
      throw error;
    }
  },
});

const embeddingCache = createCachedAction(
  internal._services.ai.embeddingClient.generateEmbeddingInternal,
  {
    ttl: CACHE_TTL.embedding,
    // Bumped from the E5-era "embeddingsV4-e5-900cap" so no stale E5-cached
    // vector can leak through this cache path after the provider cutover.
    name: "embeddingsV5-openai-3small-1536",
  }
);

export const generateEmbedding = action({
  args: { text: v.string() },
  handler: async (ctx, args): Promise<number[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const normalizedText = args.text.trim();
    const result = await embeddingCache.fetch(ctx, { text: normalizedText });
    return result as number[];
  },
});

export const generateEmbeddingsBatch = action({
  args: { texts: v.array(v.string()) },
  handler: async (ctx, args): Promise<number[][]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
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
    for (let off = 0; off < uniqueTexts.length; off += EMBEDDING_BATCH_SIZE) {
      const batch = uniqueTexts.slice(off, off + EMBEDDING_BATCH_SIZE);
      const part = await ctx.runAction(
        internal._services.ai.embeddingClient.generateEmbeddingsBatchInternal,
        { texts: batch }
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

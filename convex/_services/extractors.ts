"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "../auth";
import { internal } from "../_generated/api";
import { WebLoaderService } from "./extraction/WebLoaderService";
import {
  markdownFromMistralOcrResponse,
  stripMistralOcrMedia,
} from "./extraction/MistralOCRService";
import { createCachedAction } from "./cache/cachedAgent";
import { CACHE_TTL, withJitter } from "./cache/cache";
import { createServiceLogger } from "../_lib/logging/serviceLogger";

// ============================================================
// Internal Actions (make actual API calls)
// ============================================================

export const scrapeWebPageInternal = internalAction({
  args: { url: v.string() },
  handler: async (_ctx, args): Promise<{ title: string; content: string; url: string }> => {
    const logger = createServiceLogger("extractors", "scrapeWebPageInternal");
    logger.operationStart({ url: args.url });
    const loader = new WebLoaderService();
    const result = await loader.loadWebPageWithMeta(args.url);
    logger.operationComplete({
      url: args.url,
      title: result.title,
      contentLength: result.content.length,
    });
    return result;
  },
});

export const getSocialTranscriptInternal = internalAction({
  args: { url: v.string() },
  handler: async (_ctx, args): Promise<{ title: string; content: string; url: string }> => {
    const logger = createServiceLogger("extractors", "getSocialTranscriptInternal");
    logger.operationStart({ url: args.url });
    const loader = new WebLoaderService();
    const result = await loader.loadSocialTranscriptWithMeta(args.url);
    logger.operationComplete({
      url: args.url,
      title: result.title,
      contentLength: result.content.length,
    });
    return { ...result, url: args.url };
  },
});

// ============================================================
// Cached Wrappers
// ============================================================

const scrapeCache = createCachedAction(internal._services.extractors.scrapeWebPageInternal, {
  ttl: withJitter(CACHE_TTL.documentContent, 0.15),
  name: "supadata-scrape",
});

const transcriptCache = createCachedAction(
  internal._services.extractors.getSocialTranscriptInternal,
  { ttl: withJitter(CACHE_TTL.documentContent, 0.15), name: "supadata-transcript" }
);

// ============================================================
// Public Cached Actions
// ============================================================

/**
 * Scrape a URL using Supadata (cached)
 */
export const scrapeUrl = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<{ title: string; content: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    return scrapeCache.fetch(ctx, { url: args.url });
  },
});

/**
 * Get YouTube/social transcript using Supadata (cached)
 */
export const getYouTubeTranscript = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<{ title: string; content: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    return transcriptCache.fetch(ctx, { url: args.url });
  },
});

/**
 * Extract text from a URL using Supadata (legacy alias, cached)
 */
export const extractFromUrl = scrapeUrl;

/**
 * Extract transcript from a YouTube video using Supadata (legacy alias, cached)
 */
export const extractFromYouTube = action({
  args: { videoId: v.string() },
  handler: async (ctx, args): Promise<{ title: string; content: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    return transcriptCache.fetch(ctx, {
      url: `https://youtube.com/watch?v=${args.videoId}`,
    });
  },
});

/**
 * Extract text from a PDF/image using Mistral OCR API
 */
export const extractFromOCR = action({
  args: { fileUrl: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY is not set");
    }

    const response = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          document_url: args.fileUrl,
        },
        table_format: "markdown",
        include_image_base64: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral OCR API error: ${error}`);
    }

    const data = await response.json();
    return stripMistralOcrMedia(markdownFromMistralOcrResponse(data));
  },
});

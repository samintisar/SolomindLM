"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "../auth";
import { WebLoaderService } from "./extraction/WebLoaderService";
import {
  markdownFromMistralOcrResponse,
  stripMistralOcrMedia,
} from "./extraction/MistralOCRService";

/**
 * Scrape a URL using Firecrawl
 */
export const scrapeUrl = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<{ title: string; content: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const loader = new WebLoaderService();
    return loader.loadWebPageWithMeta(args.url);
  },
});

/**
 * Get YouTube transcript using Supadata (via WebLoaderService)
 */
export const getYouTubeTranscript = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<{ title: string; content: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const loader = new WebLoaderService();
    return loader.loadSocialTranscriptWithMeta(args.url);
  },
});

/**
 * Extract text from a URL using Firecrawl (legacy alias)
 */
export const extractFromUrl = scrapeUrl;

/**
 * Extract transcript from a YouTube video using Supadata (legacy alias)
 */
export const extractFromYouTube = action({
  args: { videoId: v.string() },
  handler: async (ctx, args): Promise<{ title: string; content: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const loader = new WebLoaderService();
    return loader.loadSocialTranscriptWithMeta(`https://youtube.com/watch?v=${args.videoId}`);
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

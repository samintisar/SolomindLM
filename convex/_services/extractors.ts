"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "../auth";
import {
  markdownFromMistralOcrResponse,
  stripMistralOcrMedia,
} from "./extraction/MistralOCRService";

// PDF/DOCX extraction is handled by Mistral OCR in DocEmbeddingJob (MistralOCRService).

/**
 * Scrape a URL using Supadata API
 */
export const scrapeUrl = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<{ title: string; content: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const apiKey = process.env.SUPADATA_API_KEY;
    if (!apiKey) {
      throw new Error("SUPADATA_API_KEY is not set");
    }

    const response = await fetch(`https://api.supadata.ai/v1/url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ url: args.url }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supadata API error: ${error}`);
    }

    const data = await response.json();
    return {
      title: data.title || "",
      content: data.content || data.text || "",
    };
  },
});

/**
 * Get YouTube transcript using Supadata API
 */
export const getYouTubeTranscript = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<{ title: string; content: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    // Extract video ID from URL
    const videoIdMatch = args.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (!videoIdMatch) {
      throw new Error("Invalid YouTube URL");
    }
    const videoId = videoIdMatch[1];

    const apiKey = process.env.SUPADATA_API_KEY;
    if (!apiKey) {
      throw new Error("SUPADATA_API_KEY is not set");
    }

    const response = await fetch(`https://api.supadata.ai/v1/youtube`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ videoId }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supadata API error: ${error}`);
    }

    const data = await response.json();
    return {
      title: data.title || "",
      content: data.transcript || data.content || "",
    };
  },
});

/**
 * Extract text from a URL using Supadata API (legacy alias)
 */
export const extractFromUrl = scrapeUrl;

/**
 * Extract transcript from a YouTube video using Supadata API (legacy alias)
 */
export const extractFromYouTube = action({
  args: { videoId: v.string() },
  handler: async (ctx, args): Promise<{ title: string; content: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const apiKey = process.env.SUPADATA_API_KEY;
    if (!apiKey) {
      throw new Error("SUPADATA_API_KEY is not set");
    }

    const response = await fetch(`https://api.supadata.ai/v1/youtube`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ videoId: args.videoId }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supadata API error: ${error}`);
    }

    const data = await response.json();
    return {
      title: data.title || "",
      content: data.transcript || data.content || "",
    };
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

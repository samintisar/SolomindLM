"use node";

import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import { createExternalServiceErrorFromResponse } from "../../_lib/errors";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";

/**
 * Stitch OCR pages into one markdown string with visible page labels (HTML comments are hidden when rendered).
 */
export function markdownFromMistralOcrResponse(data: {
  pages?: Array<{ markdown?: string }>;
  markdown?: string;
  text?: string;
}): string {
  if (data?.pages && Array.isArray(data.pages) && data.pages.length > 0) {
    return data.pages
      .map((page, index) => {
        const md = page.markdown || "";
        const label = `**Page ${index + 1}**`;
        return index === 0 ? `${label}\n\n${md}` : `---\n\n${label}\n\n${md}`;
      })
      .join("\n\n");
  }
  return data.markdown || data.text || "";
}

/**
 * Strip all media references from text (images, videos, audio, etc.)
 * This ensures only text content is returned
 */
export function stripMistralOcrMedia(text: string): string {
  return text
      // Remove markdown images: ![alt](url) or ![alt][ref]
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      .replace(/!\[([^\]]*)\]\[[^\]]+\]/g, '')
      // Remove reference-style image definitions: [id]: url
      .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
      // Remove HTML <img> tags
      .replace(/<img[^>]*>/gi, '')
      .replace(/<img[^>]*\/>/gi, '')
      // Remove HTML <video> tags
      .replace(/<video[^>]*>.*?<\/video>/gis, '')
      // Remove HTML <audio> tags
      .replace(/<audio[^>]*>.*?<\/audio>/gis, '')
      // Remove HTML <picture> tags
      .replace(/<picture[^>]*>.*?<\/picture>/gis, '')
      // Remove HTML <source> tags
      .replace(/<source[^>]*>/gi, '')
      .replace(/<source[^>]*\/>/gi, '')
      // Remove HTML <embed> tags
      .replace(/<embed[^>]*>/gi, '')
      .replace(/<embed[^>]*\/>/gi, '')
      // Remove HTML <object> tags
      .replace(/<object[^>]*>.*?<\/object>/gis, '')
      // Remove HTML <figure> tags with media (keep caption text)
      .replace(/<figure[^>]*>(.*?)<\/figure>/gis, (_, content) => {
        // Extract text from <figcaption> if present, otherwise remove
        const figcaption = content.match(/<figcaption[^>]*>(.*?)<\/figcaption>/is);
        return figcaption ? figcaption[1].trim() : '';
      })
      // Remove SVG elements
      .replace(/<svg[^>]*>.*?<\/svg>/gis, '')
      // Remove data URIs (embedded images)
      .replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, '')
      .replace(/data:video\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, '')
      .replace(/data:audio\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, '')
      // Remove markdown-style media file references
      .replace(/\[([^\]]*)\]\([^)]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg|pdf)[^)]*\)/gi, '')
      // Remove standalone media URLs (http/https)
      .replace(/https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg|pdf)(\?[^\s]*)?\b/gi, '')
      // Remove file paths with media extensions
      .replace(/[^\s]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg)\b/gi, '')
      // Clean up extra whitespace and line breaks
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .replace(/^\s+|\s+$/g, "")
      .trim();
}

export class MistralOCRService {
  private apiKey: string;
  private baseUrl = 'https://api.mistral.ai/v1';
  private model = 'mistral-ocr-latest';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async callOcrEndpoint(documentUrl: string): Promise<string> {
    const logger = createServiceLogger("mistral", "ocr");

    return invokeWithHttpRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      try {
        const t0 = Date.now();
        logger.apiCall("mistral", "/ocr", { model: this.model });

        const response = await fetch(`${this.baseUrl}/ocr`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            document: {
              type: "document_url",
              document_url: documentUrl,
            },
            table_format: "markdown",
            include_image_base64: false,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (!response.ok) {
          const details = data ? JSON.stringify(data) : response.statusText;
          logger.apiError("mistral", "/ocr", new Error(`HTTP ${response.status}`));
          throw createExternalServiceErrorFromResponse(
            "mistral",
            response.status,
            "/ocr",
            details.slice(0, 400)
          );
        }

        logger.apiSuccess("mistral", "/ocr", Date.now() - t0, {});

        const content = markdownFromMistralOcrResponse(data);
        return stripMistralOcrMedia(content);
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            throw new Error("Mistral OCR request timed out");
          }
          throw error;
        }
        throw new Error("Failed to process document with Mistral OCR");
      }
    }, "mistral_ocr");
  }

  async processDocument(fileUrl: string): Promise<string> {
    return this.callOcrEndpoint(fileUrl);
  }

  async processFromUrl(url: string): Promise<string> {
    return this.callOcrEndpoint(url);
  }
}

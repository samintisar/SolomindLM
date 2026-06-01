"use node";
import { Supadata, SupadataError } from "@supadata/js";
import { invokeWithRetry } from "../../_agents/_shared/retry.js";
import { env } from "../../_lib/env";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { validateUrl } from "../../_lib/utils/urlValidation.js";

export interface WebPageMeta {
  title: string;
  content: string;
  url: string;
}

export interface TranscriptMeta {
  title: string;
  content: string;
}

export class WebLoaderService {
  private supadata: Supadata;

  constructor() {
    this.supadata = new Supadata({
      apiKey: env.SUPADATA_API_KEY,
    });
  }

  // ========================================================================
  // Text cleaners
  // ========================================================================

  /**
   * Strip all media references from text (images, videos, audio, etc.)
   * Ensures only plain text content is returned
   */
  private stripMedia(text: string): string {
    return (
      text
        // Remove markdown images: ![alt](url) or ![alt][ref]
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
        .replace(/!\[([^\]]*)\]\[[^\]]+\]/g, "")
        // Remove reference-style image definitions: [id]: url
        .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, "")
        // Remove HTML <img> tags
        .replace(/<img[^>]*>/gi, "")
        .replace(/<img[^>]*\/>/gi, "")
        // Remove HTML <video> tags
        .replace(/<video[^>]*>.*?<\/video>/gis, "")
        // Remove HTML <audio> tags
        .replace(/<audio[^>]*>.*?<\/audio>/gis, "")
        // Remove HTML <picture> tags
        .replace(/<picture[^>]*>.*?<\/picture>/gis, "")
        // Remove HTML <source> tags
        .replace(/<source[^>]*>/gi, "")
        .replace(/<source[^>]*\/>/gi, "")
        // Remove HTML <figure> tags with media (keep caption text)
        .replace(/<figure[^>]*>(.*?)<\/figure>/gis, (_, content) => {
          // Extract text from <figcaption> if present, otherwise remove
          const figcaption = content.match(/<figcaption[^>]*>(.*?)<\/figcaption>/is);
          return figcaption ? figcaption[1].trim() : "";
        })
        // Remove iframe tags (embedded videos, maps, etc.)
        .replace(/<iframe[^>]*>.*?<\/iframe>/gis, "")
        // Remove embed tags
        .replace(/<embed[^>]*>/gi, "")
        .replace(/<embed[^>]*\/>/gi, "")
        // Remove object tags
        .replace(/<object[^>]*>.*?<\/object>/gis, "")
        // Remove SVG elements
        .replace(/<svg[^>]*>.*?<\/svg>/gis, "")
        // Remove data URIs (embedded images, videos, audio)
        .replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, "")
        .replace(/data:video\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, "")
        .replace(/data:audio\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, "")
        // Remove markdown-style media file references
        .replace(
          /\[([^\]]*)\]\([^)]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg|pdf)[^)]*\)/gi,
          ""
        )
        // Remove image URLs in brackets often found in scraped content
        .replace(
          /\[?https?:\/\/[^\s\]]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)(\?[^\]\s]*)?\]?/gi,
          ""
        )
        // Remove standalone media URLs (http/https)
        .replace(
          /https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg|pdf)(\?[^\s]*)?\b/gi,
          ""
        )
        // Remove media file extensions that might appear as standalone references
        .replace(/\b\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg)\b/gi, "")
        // Remove file paths with media extensions
        .replace(/[^\s]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg)\b/gi, "")
        // Clean up extra whitespace and line breaks
        .replace(/\n\s*\n\s*\n+/g, "\n\n")
        .replace(/^\s+|\s+$/g, "")
        .trim()
    );
  }

  /**
   * Remove cookie / CMP boilerplate that often dominates scraped publisher and repository HTML
   * (OneTrust-style "Authentication, Preferences, Acknowledgement and Statistics", etc.).
   * Bounded window avoids eating real article body text.
   */
  private stripCookieConsentNoise(text: string): string {
    const t = text.replace(
      /\s*We collect and process your personal information[\s\S]{0,4500}?(?:That['']s ok|Accept all(?: cookies)?|Decline\s*That['']s ok)\s*/gi,
      "\n"
    );
    return t.replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  }

  // ========================================================================
  // Supadata-backed web extraction
  // ========================================================================

  /**
   * Extract content from a web page using Supadata.
   */
  async loadWebPage(url: string): Promise<string> {
    const { content } = await this.loadWebPageWithMeta(url);
    return content;
  }

  /**
   * Extract content plus page title using Supadata web scrape.
   * Supadata returns the page title in the `name` field.
   */
  async loadWebPageWithMeta(url: string): Promise<WebPageMeta> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    const logger = createServiceLogger("web_loader", "loadWebPageWithMeta");
    return invokeWithRetry(
      () => this.loadWebPageWithMetaInternal(url),
      {
        maxAttempts: 5,
        baseDelayMs: 2000,
        jitter: true,
        retryableErrors: (err) =>
          /limit exceeded|rate limit|too many requests|429/i.test(err.message),
        onRetry: (attempt, error, delayMs) =>
          logger.warn("Rate limited, retrying web scrape", {
            attempt,
            delayMs,
            message: error.message,
          }),
      },
      "loadWebPageWithMeta"
    );
  }

  private async loadWebPageWithMetaInternal(url: string): Promise<WebPageMeta> {
    const logger = createServiceLogger("web_loader", "scrapeWebPage");
    logger.operationStart({ url });

    try {
      const result = (await this.supadata.web.scrape(url)) as {
        content?: string;
        name?: string;
      };
      const text = result.content || "";
      const title = result.name ?? "";
      const cleanedText = this.stripCookieConsentNoise(this.stripMedia(text));

      logger.operationComplete({
        rawChars: text.length,
        cleanedChars: cleanedText.length,
        title,
        url,
      });

      return { title, content: cleanedText, url };
    } catch (e) {
      if (e instanceof SupadataError) {
        logger.error("Scrape failed", e, { code: e.error, url });
        throw new Error(`Failed to scrape web page: ${e.message}`, { cause: e });
      }
      throw e;
    }
  }

  // ========================================================================
  // Supadata-backed social media transcripts
  // ========================================================================

  /**
   * Get transcript from any supported social media platform
   * Supports: YouTube, TikTok, Instagram, X (Twitter)
   */
  async loadSocialTranscript(url: string, lang = "en"): Promise<string> {
    const { content } = await this.loadSocialTranscriptWithMeta(url, lang);
    return content;
  }

  /**
   * Get transcript plus video title when available.
   */
  async loadSocialTranscriptWithMeta(url: string, lang = "en"): Promise<TranscriptMeta> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    const logger = createServiceLogger("web_loader", "loadSocialTranscriptWithMeta");

    return invokeWithRetry(
      () => this.loadSocialTranscriptWithMetaInternal(url, lang),
      {
        maxAttempts: 5,
        baseDelayMs: 2000,
        jitter: true,
        retryableErrors: (err) =>
          /limit exceeded|rate limit|too many requests|429/i.test(err.message),
        onRetry: (attempt, error, delayMs) =>
          logger.warn("Rate limited, retrying transcript with meta", {
            attempt,
            delayMs,
            message: error.message,
          }),
      },
      "loadSocialTranscriptWithMeta"
    );
  }

  private async loadSocialTranscriptWithMetaInternal(
    url: string,
    lang: string
  ): Promise<TranscriptMeta> {
    const logger = createServiceLogger("web_loader", "transcriptInternal");
    const transcriptResult = await this.supadata.transcript({
      url,
      lang,
      text: true,
      mode: "auto",
    });

    if ("jobId" in transcriptResult) {
      logger.info("Started async transcript job", {
        jobId: (transcriptResult as { jobId: string }).jobId,
      });
      return this.pollForTranscriptWithMeta((transcriptResult as { jobId: string }).jobId, url);
    }

    const title = await this.fetchTitleFromMetadata(url);
    const result = transcriptResult as string | { content?: string };
    const text =
      typeof result === "string" ? result : (result?.content ?? JSON.stringify(result ?? ""));
    logger.operationComplete({ charCount: text.length, title });
    return { title, content: this.stripMedia(text) };
  }

  /**
   * Fetch video/post title from Supadata metadata API.
   * Works across YouTube, TikTok, Instagram, X (Twitter).
   */
  private async fetchTitleFromMetadata(url: string): Promise<string> {
    try {
      const metadata = await (this.supadata as any).metadata({ url });
      return metadata?.title ?? "";
    } catch {
      return "";
    }
  }

  /**
   * Poll for async transcript job completion; returns title when available from API
   */
  private async pollForTranscriptWithMeta(
    jobId: string,
    url: string,
    maxAttempts = 30
  ): Promise<TranscriptMeta> {
    const logger = createServiceLogger("web_loader", "pollTranscript");
    logger.operationStart({ jobId, maxAttempts });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const jobResult = await this.supadata.transcript.getJobStatus(jobId);

      if (jobResult.status === "completed") {
        const result = jobResult.result as { content?: string } | undefined;
        const content = result?.content;
        const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
        const title = await this.fetchTitleFromMetadata(url);
        logger.operationComplete({ charCount: text.length, jobId, title });
        return { title, content: this.stripMedia(text) };
      } else if (jobResult.status === "failed") {
        throw new Error(
          `Transcript job failed: ${(jobResult as { error?: { message?: string } }).error?.message || "Unknown error"}`
        );
      }

      logger.debug("Transcript job pending", {
        status: jobResult.status,
        attempt,
        maxAttempts,
        jobId,
      });
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
    }

    throw new Error(`Transcript job timed out after ${maxAttempts} attempts`);
  }

  /**
   * Check if a URL is from a supported social media platform
   */
  isSocialPlatform(url: string): boolean {
    const supportedDomains = [
      "youtube.com",
      "youtu.be",
      "tiktok.com",
      "instagram.com",
      "twitter.com",
      "x.com",
    ];
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return supportedDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }
}

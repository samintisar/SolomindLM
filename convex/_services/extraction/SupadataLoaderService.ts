"use node";
import { Supadata, SupadataError } from "@supadata/js";
import { env } from "../../_lib/env";
import { validateUrl } from "../../_lib/utils/urlValidation.js";
import { invokeWithRetry } from "../../_agents/_shared/retry.js";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";

/**
 * SupadataLoaderService handles content extraction from:
 * - YouTube videos (and other supported platforms: TikTok, Instagram, X/Twitter)
 * - Web pages (scraping)
 */
export class SupadataLoaderService {
  private supadata: Supadata;

  constructor() {
    this.supadata = new Supadata({
      apiKey: env.SUPADATA_API_KEY,
    });
  }

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

  /**
   * Get transcript from any supported social media platform
   * Supports: YouTube, TikTok, Instagram, X (Twitter)
   *
   * @param url - URL of the video content
   * @param lang - Language code (default: 'en' for English)
   * @returns Plain text transcript
   */
  async loadTranscript(url: string, lang = "en"): Promise<string> {
    // Validate URL to prevent SSRF attacks
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    const logger = createServiceLogger("supadata", "loadTranscript");
    logger.operationStart({ lang });

    const fetchOne = async (): Promise<string> => {
      const { content } = await this.loadTranscriptWithMetaInternal(url, lang);
      return content;
    };

    // Retry on rate limit (e.g. "Limit Exceeded") when multiple transcripts are fetched at once
    return invokeWithRetry(
      fetchOne,
      {
        maxAttempts: 5,
        baseDelayMs: 2000,
        jitter: true,
        retryableErrors: (err) =>
          /limit exceeded|rate limit|too many requests|429/i.test(err.message),
        onRetry: (attempt, error, delayMs) =>
          logger.warn("Rate limited, retrying transcript fetch", {
            attempt,
            delayMs,
            message: error.message,
          }),
      },
      "loadTranscript"
    );
  }

  /**
   * Get transcript plus video title when available. Used by DocEmbeddingJob for display names.
   */
  async loadTranscriptWithMeta(
    url: string,
    lang = "en"
  ): Promise<{ title: string; content: string }> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }
    const logger = createServiceLogger("supadata", "loadTranscriptWithMeta");
    return invokeWithRetry(
      () => this.loadTranscriptWithMetaInternal(url, lang),
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
      "loadTranscriptWithMeta"
    );
  }

  private async loadTranscriptWithMetaInternal(
    url: string,
    lang: string
  ): Promise<{ title: string; content: string }> {
    const logger = createServiceLogger("supadata", "transcriptInternal");
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
      return this.pollForTranscriptWithMeta((transcriptResult as { jobId: string }).jobId);
    }

    const result = transcriptResult as string | { content?: string; title?: string };
    const title =
      typeof result === "object" && result && "title" in result ? (result.title ?? "") : "";
    const text =
      typeof result === "string" ? result : (result?.content ?? JSON.stringify(result ?? ""));
    logger.operationComplete({ charCount: text.length });
    return { title, content: this.stripMedia(text) };
  }

  /**
   * Poll for async transcript job completion
   */
  private async pollForTranscript(jobId: string, maxAttempts = 30): Promise<string> {
    const { content } = await this.pollForTranscriptWithMeta(jobId, maxAttempts);
    return content;
  }

  /**
   * Poll for async transcript job completion; returns title when available from API
   */
  private async pollForTranscriptWithMeta(
    jobId: string,
    maxAttempts = 30
  ): Promise<{ title: string; content: string }> {
    const logger = createServiceLogger("supadata", "pollTranscript");
    logger.operationStart({ jobId, maxAttempts });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const jobResult = await this.supadata.transcript.getJobStatus(jobId);

      if (jobResult.status === "completed") {
        const result = jobResult.result as { content?: string; title?: string } | undefined;
        const content = result?.content;
        const title = (result as { title?: string } | undefined)?.title ?? "";
        const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
        logger.operationComplete({ charCount: text.length, jobId });
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
   * Scrape a web page and extract its text content
   *
   * @param url - URL of the web page
   * @returns Plain text content of the page
   */
  async loadWebPage(url: string): Promise<string> {
    const { content } = await this.loadWebPageWithMeta(url);
    return content;
  }

  /**
   * Scrape a web page and extract text content plus page title when available.
   * Retries on Supadata rate limits (same as transcript) — e.g. "Limit Exceeded" when many URL sources process at once.
   */
  async loadWebPageWithMeta(url: string): Promise<{ title: string; content: string }> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    const logger = createServiceLogger("supadata", "scrapeWebPage");
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

  private async loadWebPageWithMetaInternal(url: string): Promise<{ title: string; content: string }> {
    const logger = createServiceLogger("supadata", "scrapeWebPage");
    logger.operationStart({});

    try {
      const scrapeResult = (await this.supadata.web.scrape(url)) as {
        content?: string;
        title?: string;
      };
      const text = scrapeResult.content || "";
      const title = scrapeResult.title ?? "";
      const cleanedText = this.stripCookieConsentNoise(this.stripMedia(text));
      logger.operationComplete({
        rawChars: text.length,
        cleanedChars: cleanedText.length,
      });
      return { title, content: cleanedText };
    } catch (e) {
      if (e instanceof SupadataError) {
        logger.error("Scrape failed", e, { code: e.error });
        throw new Error(`Failed to scrape web page: ${e.message}`, { cause: e });
      }
      throw e;
    }
  }

  /**
   * Map website URLs (get all pages)
   *
   * @param url - Base URL of the website
   * @returns Site map with URLs
   */
  async mapWebsite(url: string) {
    // Validate URL to prevent SSRF attacks
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    const logger = createServiceLogger("supadata", "mapWebsite");
    logger.operationStart({});

    try {
      const siteMap = await this.supadata.web.map(url);
      logger.operationComplete({ urlCount: siteMap.urls?.length || 0 });
      return siteMap;
    } catch (e) {
      if (e instanceof SupadataError) {
        logger.error("Map failed", e, { code: e.error });
        throw new Error(`Failed to map website: ${e.message}`, { cause: e });
      }
      throw e;
    }
  }

  /**
   * Crawl website (fetch multiple pages)
   *
   * @param url - Base URL of the website
   * @param limit - Maximum number of pages to crawl
   * @returns Crawl job results
   */
  async crawlWebsite(url: string, limit = 10) {
    // Validate URL to prevent SSRF attacks
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    const logger = createServiceLogger("supadata", "crawlWebsite");
    logger.operationStart({ limit });

    try {
      const crawl = await this.supadata.web.crawl({ url, limit });
      const jobId = crawl.jobId;

      // Poll for crawl results
      for (let attempt = 1; attempt <= 30; attempt++) {
        const crawlResults = await this.supadata.web.getCrawlResults(jobId);

        if (crawlResults.status === "completed") {
          logger.operationComplete({ pageCount: crawlResults.pages?.length || 0, jobId });
          return crawlResults;
        } else if (crawlResults.status === "failed") {
          throw new Error("Crawl job failed");
        }

        logger.debug("Crawl pending", { status: crawlResults.status, attempt, jobId });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      throw new Error("Crawl job timed out");
    } catch (e) {
      if (e instanceof SupadataError) {
        logger.error("Crawl failed", e, { code: e.error });
        throw new Error(`Failed to crawl website: ${e.message}`, { cause: e });
      }
      throw e;
    }
  }

  /**
   * Extract video ID from YouTube URL
   * Helper method for compatibility with existing code
   */
  extractVideoId(url: string): string {
    const regex =
      /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
    const match = url.match(regex);
    if (!match?.[1]) throw new Error("Invalid YouTube URL");
    return match[1];
  }

  /**
   * Check if a URL is from a supported social media platform
   */
  isSupportedPlatform(url: string): boolean {
    const supportedDomains = [
      "youtube.com",
      "youtu.be",
      "tiktok.com",
      "instagram.com",
      "twitter.com",
      "x.com",
    ];
    return supportedDomains.some((domain) => url.includes(domain));
  }

  /**
   * Unified method to load content from any source
   * Automatically detects the type and uses appropriate method
   */
  async loadContent(url: string): Promise<string> {
    if (this.isSupportedPlatform(url)) {
      return this.loadTranscript(url);
    } else {
      return this.loadWebPage(url);
    }
  }
}

"use node";
import { Supadata } from "@supadata/js";
import FirecrawlApp from "@mendable/firecrawl-js";
import { env } from "../../_lib/env";
import { validateUrl } from "../../_lib/utils/urlValidation.js";
import { invokeWithRetry } from "../../_agents/_shared/retry.js";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";

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
  private firecrawl: FirecrawlApp;

  constructor() {
    this.supadata = new Supadata({
      apiKey: env.SUPADATA_API_KEY,
    });
    this.firecrawl = new FirecrawlApp({ apiKey: env.FIRECRAWL_API_KEY });
  }

  // ========================================================================
  // Text cleaners (ported exactly from SupadataLoaderService)
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
  // Firecrawl-backed methods
  // ========================================================================

  /**
   * Scrape a web page and extract its text content
   */
  async loadWebPage(url: string): Promise<string> {
    const { content } = await this.loadWebPageWithMeta(url);
    return content;
  }

  /**
   * Scrape a web page and extract text content plus page title and URL.
   */
  async loadWebPageWithMeta(url: string): Promise<WebPageMeta> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    const logger = createServiceLogger("web_loader", "loadWebPageWithMeta");
    logger.operationStart({ url });

    try {
      const result = (await this.firecrawl.scrape(url, {
        formats: ["markdown"],
        proxy: "auto",
        parsers: [],
      })) as {
        markdown?: string;
        metadata?: { title?: string };
      };

      const text = result.markdown || "";
      const title = result.metadata?.title ?? "";
      const cleanedText = this.stripCookieConsentNoise(this.stripMedia(text));

      logger.operationComplete({
        rawChars: text.length,
        cleanedChars: cleanedText.length,
        url,
      });

      return { title, content: cleanedText, url };
    } catch (e) {
      logger.error("Scrape failed", e, { url });
      throw new Error(`Failed to scrape web page: ${e instanceof Error ? e.message : String(e)}`, {
        cause: e,
      });
    }
  }

  /**
   * Start a crawl job and return the jobId immediately. Does not poll.
   */
  async startCrawl(url: string, limit?: number): Promise<{ jobId: string }> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    const logger = createServiceLogger("web_loader", "startCrawl");
    logger.operationStart({ url, limit });

    try {
      const result = (await this.firecrawl.crawl(url, {
        limit,
        scrapeOptions: {
          formats: ["markdown"],
          proxy: "auto",
        },
      })) as { id?: string; jobId?: string };

      const jobId = result.id || result.jobId;
      if (!jobId) {
        throw new Error("Crawl job did not return a jobId");
      }

      logger.operationComplete({ jobId, url });
      return { jobId };
    } catch (e) {
      logger.error("Crawl start failed", e, { url });
      throw new Error(`Failed to start crawl: ${e instanceof Error ? e.message : String(e)}`, {
        cause: e,
      });
    }
  }

  /**
   * Check the status of a crawl job.
   */
  async checkCrawlStatus(
    jobId: string
  ): Promise<{ status: string; pages?: Array<{ url: string; content: string }> }> {
    const logger = createServiceLogger("web_loader", "checkCrawlStatus");
    logger.operationStart({ jobId });

    try {
      const result = (await this.firecrawl.getCrawlStatus(jobId)) as {
        status?: string;
        data?: Array<{
          markdown?: string;
          metadata?: { sourceURL?: string; url?: string };
        }>;
      };

      const status = result.status || "unknown";
      const pages = result.data?.map((page) => ({
        url: page.metadata?.sourceURL || page.metadata?.url || "",
        content: page.markdown || "",
      }));

      logger.operationComplete({ status, pageCount: pages?.length || 0, jobId });
      return { status, pages };
    } catch (e) {
      logger.error("Check crawl status failed", e, { jobId });
      throw new Error(
        `Failed to check crawl status: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e }
      );
    }
  }

  /**
   * Map a website and return all discovered URLs.
   */
  async mapWebsite(url: string): Promise<{ urls: string[] }> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    const logger = createServiceLogger("web_loader", "mapWebsite");
    logger.operationStart({ url });

    try {
      const result = (await this.firecrawl.map(url)) as unknown as {
        links?: Array<string | { url?: string }>;
      };
      const urls =
        result.links?.map((link) =>
          typeof link === "string" ? link : link.url || ""
        ).filter(Boolean) || [];
      logger.operationComplete({ urlCount: urls.length, url });
      return { urls };
    } catch (e) {
      logger.error("Map failed", e, { url });
      throw new Error(`Failed to map website: ${e instanceof Error ? e.message : String(e)}`, {
        cause: e,
      });
    }
  }

  // ========================================================================
  // Supadata-backed methods (social media transcripts)
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
   * Poll for async transcript job completion; returns title when available from API
   */
  private async pollForTranscriptWithMeta(
    jobId: string,
    maxAttempts = 30
  ): Promise<TranscriptMeta> {
    const logger = createServiceLogger("web_loader", "pollTranscript");
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
      return supportedDomains.some((domain) =>
        hostname === domain || hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }
}

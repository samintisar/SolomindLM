"use node"
import { Supadata, SupadataError } from '@supadata/js';
import { env } from '../../helpers/env';
import { validateUrl } from '../../utils/urlValidation.js';
import { invokeWithRetry } from '../agents/shared/retry.js';

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
      // Remove HTML <figure> tags with media (keep caption text)
      .replace(/<figure[^>]*>(.*?)<\/figure>/gis, (_, content) => {
        // Extract text from <figcaption> if present, otherwise remove
        const figcaption = content.match(/<figcaption[^>]*>(.*?)<\/figcaption>/is);
        return figcaption ? figcaption[1].trim() : '';
      })
      // Remove iframe tags (embedded videos, maps, etc.)
      .replace(/<iframe[^>]*>.*?<\/iframe>/gis, '')
      // Remove embed tags
      .replace(/<embed[^>]*>/gi, '')
      .replace(/<embed[^>]*\/>/gi, '')
      // Remove object tags
      .replace(/<object[^>]*>.*?<\/object>/gis, '')
      // Remove SVG elements
      .replace(/<svg[^>]*>.*?<\/svg>/gis, '')
      // Remove data URIs (embedded images, videos, audio)
      .replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, '')
      .replace(/data:video\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, '')
      .replace(/data:audio\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, '')
      // Remove markdown-style media file references
      .replace(/\[([^\]]*)\]\([^)]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg|pdf)[^)]*\)/gi, '')
      // Remove image URLs in brackets often found in scraped content
      .replace(/\[?https?:\/\/[^\s\]]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)(\?[^\]\s]*)?\]?/gi, '')
      // Remove standalone media URLs (http/https)
      .replace(/https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg|pdf)(\?[^\s]*)?\b/gi, '')
      // Remove media file extensions that might appear as standalone references
      .replace(/\b\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg)\b/gi, '')
      // Remove file paths with media extensions
      .replace(/[^\s]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg)\b/gi, '')
      // Clean up extra whitespace and line breaks
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .replace(/^\s+|\s+$/g, '')
      .trim();
  }

  /**
   * Get transcript from any supported social media platform
   * Supports: YouTube, TikTok, Instagram, X (Twitter)
   *
   * @param url - URL of the video content
   * @param lang - Language code (default: 'en' for English)
   * @returns Plain text transcript
   */
  async loadTranscript(url: string, lang = 'en'): Promise<string> {
    // Validate URL to prevent SSRF attacks
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    console.log(`[Supadata] Fetching transcript for: ${url} (lang: ${lang})`);

    const fetchOne = async (): Promise<string> => {
      try {
        const transcriptResult = await this.supadata.transcript({
          url,
          lang,
          text: true, // Return plain text instead of timestamped chunks
          mode: 'auto', // 'native', 'auto', or 'generate'
        });

        // Check if we got a transcript directly or a job ID for async processing
        if ('jobId' in transcriptResult) {
          // For large files, we need to poll for results
          console.log(`[Supadata] Started transcript job: ${transcriptResult.jobId}`);
          return this.stripMedia(await this.pollForTranscript(transcriptResult.jobId));
        } else {
          // For smaller files, we get the transcript directly
          const text = typeof transcriptResult === 'string'
            ? transcriptResult
            : JSON.stringify(transcriptResult);
          console.log(`[Supadata] Successfully fetched transcript (${text.length} chars)`);
          return this.stripMedia(text);
        }
      } catch (e) {
        if (e instanceof SupadataError) {
          console.error(`[Supadata] Error (${e.error}): ${e.message}`);
          throw new Error(`Failed to fetch transcript: ${e.message}`);
        }
        throw e;
      }
    };

    // Retry on rate limit (e.g. "Limit Exceeded") when multiple transcripts are fetched at once
    return invokeWithRetry(fetchOne, {
      maxAttempts: 5,
      baseDelayMs: 2000,
      jitter: true,
      retryableErrors: (err) =>
        /limit exceeded|rate limit|too many requests|429/i.test(err.message),
      onRetry: (attempt, error, delayMs) =>
        console.warn(`[Supadata] Rate limited, retry ${attempt} in ${delayMs}ms: ${error.message}`),
    }, 'loadTranscript');
  }

  /**
   * Poll for async transcript job completion
   */
  private async pollForTranscript(jobId: string, maxAttempts = 30): Promise<string> {
    console.log(`[Supadata] Polling for job ${jobId}...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const jobResult = await this.supadata.transcript.getJobStatus(jobId);

      if (jobResult.status === 'completed') {
        const content = jobResult.result?.content;
        const text = typeof content === 'string'
          ? content
          : JSON.stringify(content);
        console.log(`[Supadata] Job completed (${text.length} chars)`);
        return text; // stripMedia is called by the caller (loadTranscript)
      } else if (jobResult.status === 'failed') {
        throw new Error(`Transcript job failed: ${jobResult.error?.message || 'Unknown error'}`);
      }

      // Job is still 'queued' or 'active', wait and retry
      console.log(`[Supadata] Job status: ${jobResult.status} (attempt ${attempt}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
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
    // Validate URL to prevent SSRF attacks
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.error}`);
    }

    console.log(`[Supadata] Scraping web page: ${url}`);

    try {
      const scrapeResult = await this.supadata.web.scrape(url);

      // Extract text content from the scrape result
      const text = scrapeResult.content || '';
      const cleanedText = this.stripMedia(text);
      console.log(`[Supadata] Successfully scraped page (${text.length} chars, ${cleanedText.length} after cleaning)`);
      return cleanedText;

    } catch (e) {
      if (e instanceof SupadataError) {
        console.error(`[Supadata] Error (${e.error}): ${e.message}`);
        throw new Error(`Failed to scrape web page: ${e.message}`);
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

    console.log(`[Supadata] Mapping website: ${url}`);

    try {
      const siteMap = await this.supadata.web.map(url);
      console.log(`[Supadata] Found ${siteMap.urls?.length || 0} pages`);
      return siteMap;
    } catch (e) {
      if (e instanceof SupadataError) {
        console.error(`[Supadata] Error (${e.error}): ${e.message}`);
        throw new Error(`Failed to map website: ${e.message}`);
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

    console.log(`[Supadata] Crawling website: ${url} (limit: ${limit})`);

    try {
      const crawl = await this.supadata.web.crawl({ url, limit });
      const jobId = crawl.jobId;

      // Poll for crawl results
      for (let attempt = 1; attempt <= 30; attempt++) {
        const crawlResults = await this.supadata.web.getCrawlResults(jobId);

        if (crawlResults.status === 'completed') {
          console.log(`[Supadata] Crawl completed with ${crawlResults.pages?.length || 0} pages`);
          return crawlResults;
        } else if (crawlResults.status === 'failed') {
          throw new Error('Crawl job failed');
        }

        console.log(`[Supadata] Crawl status: ${crawlResults.status} (attempt ${attempt}/30)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      throw new Error('Crawl job timed out');
    } catch (e) {
      if (e instanceof SupadataError) {
        console.error(`[Supadata] Error (${e.error}): ${e.message}`);
        throw new Error(`Failed to crawl website: ${e.message}`);
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
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    if (!match?.[1]) throw new Error('Invalid YouTube URL');
    return match[1];
  }

  /**
   * Check if a URL is from a supported social media platform
   */
  isSupportedPlatform(url: string): boolean {
    const supportedDomains = [
      'youtube.com',
      'youtu.be',
      'tiktok.com',
      'instagram.com',
      'twitter.com',
      'x.com',
    ];
    return supportedDomains.some(domain => url.includes(domain));
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

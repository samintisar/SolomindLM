"use node"

import OpenAI from 'openai';

import {
  invokeWithTimeout,
  logError,
  logInfo,
  logWarn,
} from '../../_shared/index.js';

import { GRAPH_CONFIG } from '../config.js';
import type { Slide } from '../prompts.js';

/**
 * SlideImageGenerationService handles OpenAI gpt-image-1.5 API calls
 * and uploads generated images to Convex storage.
 */
export class SlideImageGenerationService {
  private client: OpenAI;
  private uploadStorage: (buffer: Buffer, fileName: string) => Promise<string>;
  private maxRetries = 2; // More retries for rate limit handling

  constructor(apiKey: string, uploadStorage: (buffer: Buffer, fileName: string) => Promise<string>) {
    if (!apiKey || apiKey.trim().length === 0) {
      logWarn(
        {
          agent: 'SlideDeckGraph',
          phase: 'image_service_init',
        } as any,
        'OpenAI API key not configured - image generation will be skipped'
      );
    }
    this.client = new OpenAI({ apiKey });
    this.uploadStorage = uploadStorage;
  }

  /**
   * Generate a slide image using ZhipuAI glm-image model.
   * Returns the image as a Buffer.
   */
  async generateSlideImage(prompt: string, slideNumber: number): Promise<Buffer> {
  const startTime = Date.now();

  logInfo(
    {
      agent: 'SlideDeckGraph',
      phase: 'image_generation',
      slideNumber,
      promptLength: prompt.length,
    } as any,
    `Generating slide ${slideNumber} with OpenAI gpt-image-1.5...`
  );

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
    try {
      const response = await invokeWithTimeout(
        async () => {
          try {
            return await this.client.images.generate({
              model: 'gpt-image-1.5',
              prompt: prompt,
              size: '1536x1024',
              quality: 'medium',
              n: 1,
            });
          } catch (apiError: any) {
            // Handle OpenAI-specific error structure
            const errorMessage =
              apiError?.message ||
              apiError?.error?.message ||
              apiError?.response?.data?.error?.message ||
              String(apiError);

            // Check for specific error codes
            const statusCode = apiError?.status || apiError?.response?.status;

            if (statusCode === 401) {
              throw new Error(`OpenAI authentication failed: ${errorMessage}`);
            } else if (statusCode === 400) {
              throw new Error(`OpenAI invalid request: ${errorMessage}`);
            } else if (statusCode === 429) {
              // Rate limit error - preserve for retry logic
              throw apiError;
            } else {
              throw new Error(`OpenAI API error: ${errorMessage}`);
            }
          }
        },
        GRAPH_CONFIG.IMAGE_TIMEOUT_MS,
        'OpenAIImageGen'
      );

      // OpenAI returns { data: [{ url: string }] }
      const imageUrl = response.data[0]?.url;

      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error('Unexpected response format from OpenAI SDK: no image URL returned');
      }

      const imageResponse = await fetch(imageUrl);

      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from URL: ${imageResponse.statusText}`);
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      const imageData = Buffer.from(arrayBuffer);

      const elapsed = Date.now() - startTime;
      logInfo(
        {
          agent: 'SlideDeckGraph',
          phase: 'image_generation',
          slideNumber,
          attempt,
          imageSize: imageData.length,
          processingTimeMs: elapsed,
        } as any,
        `Slide ${slideNumber} generated successfully (${(imageData.length / 1024).toFixed(2)} KB)`
      );

      return imageData;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check for rate limit error (429)
      const isRateLimit = error?.status === 429 || error?.code === 'rate_limit_exceeded';

      let errorDetails: any;
      if (error instanceof Error) {
        errorDetails = {
          message: error.message,
          name: error.name,
          isRateLimit,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        };
      } else if (typeof error === 'object' && error !== null) {
        errorDetails = {
          ...JSON.parse(JSON.stringify(error)),
          isRateLimit,
        };
      } else {
        errorDetails = { error: String(error), isRateLimit };
      }

      logWarn(
        {
          agent: 'SlideDeckGraph',
          phase: 'image_generation',
          slideNumber,
          attempt,
          error: errorDetails,
        } as any,
        `Attempt ${attempt}/${this.maxRetries} failed for slide ${slideNumber}: ${lastError.message}${isRateLimit ? ' (rate limit)' : ''}`
      );

      // Fail fast on auth or invalid request errors
      if (error?.status === 401 || error?.status === 400) {
        break;
      }

      if (attempt < this.maxRetries) {
        // Use exponential backoff for rate limits, shorter for server errors
        const baseDelay = isRateLimit ? 2000 : 1000;
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 16000);

        if (isRateLimit) {
          logInfo(
            {
              agent: 'SlideDeckGraph',
              phase: 'image_generation',
              slideNumber,
              attempt,
              delayMs: delay,
            } as any,
            `Rate limit hit. Waiting ${delay}ms before retry ${attempt + 1}/${this.maxRetries}...`
          );
        } else {
          logInfo(
            {
              agent: 'SlideDeckGraph',
              phase: 'image_generation',
              slideNumber,
              attempt,
              delayMs: delay,
            } as any,
            `Waiting ${delay}ms before retry ${attempt + 1}/${this.maxRetries}...`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logError(
    {
      agent: 'SlideDeckGraph',
      phase: 'image_generation',
      slideNumber,
      error: lastError?.message,
    } as any,
    `Failed to generate slide ${slideNumber} after ${this.maxRetries} attempts`
  );

  throw lastError || new Error('Failed to generate slide image');
}

  /**
   * Upload an image buffer to storage.
   * Returns the public URL of the uploaded image.
   */
  async uploadImage(imageBuffer: Buffer, slideNumber: number, slideDeckId: string): Promise<string> {
    const fileName = `slide-decks/${slideDeckId}/slide-${slideNumber}-${Date.now()}.png`;

    logInfo(
      {
        agent: 'SlideDeckGraph',
        phase: 'upload_image',
        slideNumber,
        fileName,
        fileSize: imageBuffer.length,
      } as any,
      `Uploading slide ${slideNumber} to storage...`
    );

    try {
      const publicUrl = await this.uploadStorage(imageBuffer, fileName);

      logInfo(
        {
          agent: 'SlideDeckGraph',
          phase: 'upload_image',
          slideNumber,
          publicUrl,
        } as any,
        `Slide ${slideNumber} uploaded successfully`
      );

      return publicUrl;
    } catch (error) {
      logError(
        {
          agent: 'SlideDeckGraph',
          phase: 'upload_image',
          slideNumber,
          error: error instanceof Error ? error.message : String(error),
        } as any,
        `Failed to upload slide ${slideNumber}`
      );

      throw error;
    }
  }

  /**
   * Generate all slide images sequentially with rate limiting.
   * Returns an array of slide objects with image URLs.
   *
   * Note: Processes slides sequentially (concurrency=1) with delays to avoid ZhipuAI API rate limits.
   */
  async generateSlideImages(
    slides: Slide[],
    slideDeckId: string,
    concurrency: number = 1
  ): Promise<Slide[]> {
    logInfo(
      {
        agent: 'SlideDeckGraph',
        phase: 'generate_slide_images',
        totalSlides: slides.length,
        concurrency,
      } as any,
      `Starting image generation for ${slides.length} slides...`
    );

    const DELAY_BETWEEN_REQUESTS_MS = 10000;
    const results: Slide[] = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];

      try {
        if (i > 0) {
          logInfo(
            {
              agent: 'SlideDeckGraph',
              phase: 'generate_slide_images',
              slideNumber: slide.slideNumber,
            } as any,
            `Waiting ${DELAY_BETWEEN_REQUESTS_MS}ms before generating slide ${slide.slideNumber}...`
          );
          await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
        }

        const imageBuffer = await this.generateSlideImage(slide.prompt, slide.slideNumber);

        const imageUrl = await this.uploadImage(imageBuffer, slide.slideNumber, slideDeckId);

        results.push({
          ...slide,
          imageUrl,
        } as Slide);
      } catch (error) {
        logError(
          {
            agent: 'SlideDeckGraph',
            phase: 'generate_slide_images',
            slideNumber: slide.slideNumber,
            slideTitle: slide.title,
            error: error instanceof Error ? error.message : String(error),
          } as any,
          `CRITICAL: Failed to generate image for slide ${slide.slideNumber}. Aborting slide deck generation.`
        );

        throw new Error(
          `Failed to generate image for slide ${slide.slideNumber} ("${slide.title}"): ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const successCount = results.filter((s) => s.imageUrl && !s.imageUrl.includes('placeholder')).length;
    logInfo(
      {
        agent: 'SlideDeckGraph',
        phase: 'generate_slide_images',
        totalSlides: slides.length,
        successful: successCount,
        failed: slides.length - successCount,
      } as any,
      `Image generation complete: ${successCount}/${slides.length} slides generated`
    );

    return results;
  }
}

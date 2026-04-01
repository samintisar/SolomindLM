"use node"

import { ZhipuAI } from 'zhipuai-sdk-nodejs-v4';

import {
  invokeWithTimeout,
  logError,
  logInfo,
  logWarn,
} from '../../_shared/index.js';

import { GRAPH_CONFIG } from '../config.js';
import type { Slide } from '../prompts.js';

/**
 * SlideImageGenerationService handles ZhipuAI glm-image API calls
 * and uploads generated images to Convex storage.
 */
export class SlideImageGenerationService {
  private client: ZhipuAI;
  private uploadStorage: (buffer: Buffer, fileName: string) => Promise<string>;
  private maxRetries = 1; // Only 1 retry - ZhipuAI rate limits are very strict, retrying immediately doesn't help

  constructor(apiKey: string, uploadStorage: (buffer: Buffer, fileName: string) => Promise<string>) {
    if (!apiKey || apiKey.trim().length === 0) {
      logWarn(
        {
          agent: 'SlideDeckGraph',
          phase: 'image_service_init',
        } as any,
        'ZhipuAI API key not configured - image generation will be skipped'
      );
    }
    this.client = new ZhipuAI({ apiKey });
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
      `Generating slide ${slideNumber} with ZhipuAI glm-image...`
    );

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await invokeWithTimeout(
          async () => {
            try {
              return await this.client.createImages({
                model: 'glm-image',
                prompt: prompt,
                size: '1728x960', // Standard slide aspect ratio (16:9)
                n: 1,
              });
            } catch (apiError: any) {
              const errorMessage =
                apiError?.message ||
                apiError?.error?.message ||
                apiError?.response?.data?.error?.message ||
                String(apiError);
              throw new Error(`ZhipuAI API error: ${errorMessage}`);
            }
          },
          GRAPH_CONFIG.IMAGE_TIMEOUT_MS,
          'ZhipuAIImageGen'
        );

        let imageUrl: string | undefined;
        const firstItem = response.data?.[0];

        if (typeof firstItem === 'string') {
          imageUrl = firstItem;
        } else if (typeof firstItem === 'object' && firstItem !== null && 'url' in firstItem) {
          imageUrl = (firstItem as { url: string }).url;
        } else if (typeof firstItem === 'object' && firstItem !== null && 'b64_json' in firstItem) {
          throw new Error('ZhipuAI returned base64 image instead of URL - not yet supported');
        }

        if (!imageUrl || typeof imageUrl !== 'string') {
          throw new Error('Unexpected response format from ZhipuAI SDK: no image URL returned');
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
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        let errorDetails: any;
        if (error instanceof Error) {
          errorDetails = {
            message: error.message,
            name: error.name,
            stack: error.stack?.split('\n').slice(0, 3).join('\n'),
          };
        } else if (typeof error === 'object' && error !== null) {
          errorDetails = JSON.parse(JSON.stringify(error));
        } else {
          errorDetails = { error: String(error) };
        }

        logWarn(
          {
            agent: 'SlideDeckGraph',
            phase: 'image_generation',
            slideNumber,
            attempt,
            error: errorDetails,
          } as any,
          `Attempt ${attempt}/${this.maxRetries} failed for slide ${slideNumber}: ${lastError.message}`
        );

        if (attempt < this.maxRetries) {
          const baseDelay = 2000;
          const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 15000);
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

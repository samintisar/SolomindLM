"use node"

import OpenAI from 'openai';

import { invokeWithTimeout } from '../../_shared/index.js';
import { createAgentGraphLogger } from '../../_shared/logging.js';

import { GRAPH_CONFIG } from '../config.js';
import type { Slide } from '../prompts.js';

/**
 * SlideImageGenerationService handles OpenAI gpt-image-1.5 API calls
 * and uploads generated images to Convex storage.
 *
 * Features:
 * - Model: gpt-image-1.5
 * - Size: 1536x1024 (16:9 landscape)
 * - Quality: medium (balanced text rendering and cost)
 * - Format: Base64 PNG (gpt-image-1.5 default) or URL fallback
 * - Concurrency: 2 slides in parallel
 * - Rate limiting: 1s delay between batches, exponential backoff on 429
 */
export class SlideImageGenerationService {
  private client: OpenAI;
  private uploadStorage: (buffer: Buffer, fileName: string) => Promise<string>;
  private maxRetries = 2; // More retries for rate limit handling
  private readonly logger = createAgentGraphLogger('SlideDeckGraph', 'slides');

  constructor(apiKey: string, uploadStorage: (buffer: Buffer, fileName: string) => Promise<string>) {
    if (!apiKey || apiKey.trim().length === 0) {
      this.logger.warn('OpenAI API key not configured - image generation will be skipped', {
        agent: 'SlideDeckGraph',
        phase: 'image_service_init',
      });
    }
    this.client = new OpenAI({ apiKey });
    this.uploadStorage = uploadStorage;
  }

  /**
   * Generate a slide image using OpenAI gpt-image-1.5 model.
   * Returns the image as a Buffer.
   */
  async generateSlideImage(prompt: string, slideNumber: number): Promise<Buffer> {
  const startTime = Date.now();

  this.logger.info(`Generating slide ${slideNumber} with OpenAI gpt-image-1.5...`, {
    agent: 'SlideDeckGraph',
    phase: 'image_generation',
    slideNumber,
    promptLength: prompt.length,
  });

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
              throw new Error(`OpenAI authentication failed: ${errorMessage}`, { cause: apiError });
            } else if (statusCode === 400) {
              throw new Error(`OpenAI invalid request: ${errorMessage}`, { cause: apiError });
            } else if (statusCode === 429) {
              // Rate limit error - preserve for retry logic
              throw apiError;
            } else {
              throw new Error(`OpenAI API error: ${errorMessage}`, { cause: apiError });
            }
          }
        },
        GRAPH_CONFIG.IMAGE_TIMEOUT_MS,
        'OpenAIImageGen'
      );

      // OpenAI returns { data: [{ url?: string, b64_json?: string }] }
      // gpt-image-1.5 returns base64 by default
      const imageDataItem = response.data?.[0];
      const base64Data = imageDataItem?.b64_json;
      const imageUrl = imageDataItem?.url;

      let imageData: Buffer;

      if (base64Data && typeof base64Data === 'string') {
        // Handle base64 response (gpt-image-1.5 default)
        imageData = Buffer.from(base64Data, 'base64');
      } else if (imageUrl && typeof imageUrl === 'string') {
        // Handle URL response (fallback for other models)
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image from URL: ${imageResponse.statusText}`);
        }
        const arrayBuffer = await imageResponse.arrayBuffer();
        imageData = Buffer.from(arrayBuffer);
      } else {
        throw new Error('Unexpected response format from OpenAI SDK: no url or b64_json returned');
      }

      const elapsed = Date.now() - startTime;
      this.logger.info(`Slide ${slideNumber} generated successfully (${(imageData.length / 1024).toFixed(2)} KB)`, {
        agent: 'SlideDeckGraph',
        phase: 'image_generation',
        slideNumber,
        attempt,
        imageSize: imageData.length,
        processingTimeMs: elapsed,
      });

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

      this.logger.warn(
        `Attempt ${attempt}/${this.maxRetries} failed for slide ${slideNumber}: ${lastError.message}${isRateLimit ? ' (rate limit)' : ''}`,
        {
          agent: 'SlideDeckGraph',
          phase: 'image_generation',
          slideNumber,
          attempt,
          error: errorDetails,
        }
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
          this.logger.info(`Rate limit hit. Waiting ${delay}ms before retry ${attempt + 1}/${this.maxRetries}...`, {
            agent: 'SlideDeckGraph',
            phase: 'image_generation',
            slideNumber,
            attempt,
            delayMs: delay,
          });
        } else {
          this.logger.info(`Waiting ${delay}ms before retry ${attempt + 1}/${this.maxRetries}...`, {
            agent: 'SlideDeckGraph',
            phase: 'image_generation',
            slideNumber,
            attempt,
            delayMs: delay,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  this.logger.phaseError(
    'image_generation',
    lastError || new Error('Unknown image generation failure'),
    {
      agent: 'SlideDeckGraph',
      slideNumber,
    }
  );

  throw lastError || new Error('Failed to generate slide image');
}

  /**
   * Upload an image buffer to storage.
   * Returns the public URL of the uploaded image.
   */
  async uploadImage(imageBuffer: Buffer, slideNumber: number, slideDeckId: string): Promise<string> {
    const fileName = `slide-decks/${slideDeckId}/slide-${slideNumber}-${Date.now()}.png`;

    this.logger.info(`Uploading slide ${slideNumber} to storage...`, {
      agent: 'SlideDeckGraph',
      phase: 'upload_image',
      slideNumber,
      fileName,
      fileSize: imageBuffer.length,
    });

    try {
      const publicUrl = await this.uploadStorage(imageBuffer, fileName);

      this.logger.info(`Slide ${slideNumber} uploaded successfully`, {
        agent: 'SlideDeckGraph',
        phase: 'upload_image',
        slideNumber,
        publicUrl,
      });

      return publicUrl;
    } catch (error) {
      this.logger.phaseError(
        'upload_image',
        error instanceof Error ? error : new Error(String(error)),
        { agent: 'SlideDeckGraph', slideNumber }
      );

      throw error;
    }
  }

  /**
   * Generate all slide images with optimized batching.
   * Returns an array of slide objects with image URLs.
   *
   * Processes slides in batches (default concurrency=2) with minimal delays
   * to optimize for OpenAI's higher rate limits (5-250 IPM depending on tier).
   *
   * @param slides - Array of slides with prompts
   * @param slideDeckId - ID for organizing uploaded images in storage
   * @param concurrency - Number of slides to process in parallel (default: 2)
   * @returns Promise<Slide[]> - Slides with imageUrl populated
   * @throws Error if any batch fails after retries
   */
  async generateSlideImages(
    slides: Slide[],
    slideDeckId: string,
    concurrency: number = 2
  ): Promise<Slide[]> {
    this.logger.info(`Starting image generation for ${slides.length} slides with concurrency ${concurrency}...`, {
      agent: 'SlideDeckGraph',
      phase: 'generate_slide_images',
      totalSlides: slides.length,
      concurrency,
    });

    const DELAY_BETWEEN_BATCHES_MS = 1000;
    const results: Slide[] = [];
    
    // Process slides in batches
    for (let batchStart = 0; batchStart < slides.length; batchStart += concurrency) {
      const batchEnd = Math.min(batchStart + concurrency, slides.length);
      const batch = slides.slice(batchStart, batchEnd);
      const batchNumber = Math.floor(batchStart / concurrency) + 1;
      const totalBatches = Math.ceil(slides.length / concurrency);

      this.logger.info(`Processing batch ${batchNumber}/${totalBatches} (slides ${batchStart + 1}-${batchEnd})...`, {
        agent: 'SlideDeckGraph',
        phase: 'generate_slide_images',
        batchNumber,
        totalBatches,
        batchSize: batch.length,
        slideRange: `${batchStart + 1}-${batchEnd}`,
      });

      // Add delay between batches (not before first batch)
      if (batchStart > 0) {
        this.logger.info(`Waiting ${DELAY_BETWEEN_BATCHES_MS}ms before processing batch ${batchNumber}...`, {
          agent: 'SlideDeckGraph',
          phase: 'generate_slide_images',
          batchNumber,
          delay: DELAY_BETWEEN_BATCHES_MS,
        });
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }

      try {
        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (slide) => {
            try {
              this.logger.info(`Generating image for slide ${slide.slideNumber}...`, {
                agent: 'SlideDeckGraph',
                phase: 'generate_slide_images',
                slideNumber: slide.slideNumber,
              });

              const imageBuffer = await this.generateSlideImage(slide.prompt, slide.slideNumber);
              const imageUrl = await this.uploadImage(imageBuffer, slide.slideNumber, slideDeckId);

              this.logger.info(`Successfully generated image for slide ${slide.slideNumber}`, {
                agent: 'SlideDeckGraph',
                phase: 'generate_slide_images',
                slideNumber: slide.slideNumber,
                imageUrl,
              });

              return {
                ...slide,
                imageUrl,
              } as Slide;
            } catch (error) {
              this.logger.phaseError(
                'generate_slide_images',
                error instanceof Error ? error : new Error(String(error)),
                {
                  agent: 'SlideDeckGraph',
                  slideNumber: slide.slideNumber,
                  slideTitle: slide.title,
                  batchNumber,
                }
              );

              // Re-throw to fail the entire batch
              throw new Error(
                `Failed to generate image for slide ${slide.slideNumber} ("${slide.title}"): ${error instanceof Error ? error.message : String(error)}`,
                { cause: error }
              );
            }
          })
        );

        // Add batch results to total results
        results.push(...batchResults);

        this.logger.info(`Completed batch ${batchNumber}/${totalBatches} (${results.length}/${slides.length} slides completed)`, {
          agent: 'SlideDeckGraph',
          phase: 'generate_slide_images',
          batchNumber,
          completedSlides: batchEnd,
          totalSlides: slides.length,
        });
      } catch (error) {
        // If batch fails, fail entire generation
        this.logger.phaseError(
          'generate_slide_images',
          error instanceof Error ? error : new Error(String(error)),
          {
            agent: 'SlideDeckGraph',
            batchNumber,
            completedSlides: results.length,
            totalSlides: slides.length,
          }
        );

        throw error;
      }
    }

    const successCount = results.filter((s) => s.imageUrl && !s.imageUrl.includes('placeholder')).length;
    this.logger.info(`Image generation complete: ${successCount}/${slides.length} slides generated`, {
      agent: 'SlideDeckGraph',
      phase: 'generate_slide_images',
      totalSlides: slides.length,
      successful: successCount,
      failed: slides.length - successCount,
    });

    return results;
  }
}

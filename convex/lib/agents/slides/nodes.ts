"use node"
/**
 * Node functions and main class for SlideDeckGraph.
 *
 * Contains all node logic for split_chunks, map_process, collapse,
 * and reduce phases, along with the SlideImageGenerationService
 * for ZhipuAI glm-image generation (with text rendering) and Convex storage upload.
 *
 * The system leverages glm-image's excellent text rendering capabilities to
 * generate complete, professional presentation slides with all text (titles,
 * bullet points, labels) baked directly into the images.
 */

import { StateGraph, START, END, Send } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { ZhipuAI } from 'zhipuai-sdk-nodejs-v4';

// Shared utilities
import {
  invokeWithTimeout,
  invokeWithRetry,
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
  allWithConcurrency,
  logInfo,
  logWarn,
  logError,
  logPhaseStart,
  logPhaseComplete,
  logBanner,
  sanitizeUserInput,
  countTokens,
  clearStateKeys,
  createLangSmithRunConfig,
} from '../shared/index.js';

// Import from local modules
import { OverallState, type OverallStateType, type ChunkProcessState, type Slide } from './state.js';
import {
  getCandidateMapPrompt,
  getRefineSlidePrompt,
  getSlideSelectionPrompt,
  SlideCandidateArraySchema,
  SlideSchema,
  SlideSelectionSchema,
  type SlideCandidate,
  type SlideCandidateResponse,
  type SlideSelectionResponse,
  GRAPH_CONFIG,
  SLIDE_COUNT_MAP,
  MAP_CONCEPTS_SYSTEM_PROMPT,
  REFINE_SLIDES_SYSTEM_PROMPT,
  SLIDE_SELECTION_SYSTEM_PROMPT,
} from './prompts.js';

// ============================================================
// STRUCTURED OUTPUT SCHEMAS
// ============================================================

/**
 * Interface for the structured LLM to avoid deep type instantiation.
 */
interface StructuredOutputInvoker<T> {
  invoke(messages: Array<SystemMessage | HumanMessage>): Promise<T>;
}

/**
 * Helper function to create a structured LLM without triggering deep type instantiation.
 */
function createStructuredLLM<T>(llm: ChatTogetherAI, schema: z.ZodTypeAny, name: string): StructuredOutputInvoker<T> {
  // @ts-ignore - Type instantiation is excessively deep with LangChain's withStructuredOutput
  return llm.withStructuredOutput(schema, { name }) as any;
}

// ============================================================
// CHUNK HELPERS
// ============================================================

/**
 * Wrapper around shared packChunks utility with SlideDeckGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'SlideDeckGraph',
  });
}

/**
 * Wrapper around shared validateChunks utility with SlideDeckGraph logging.
 */
export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'SlideDeckGraph',
  });
}

// ============================================================
// IMAGE GENERATION SERVICE
// ============================================================

/**
 * SlideImageGenerationService handles ZhipuAI glm-image API calls
 * and uploads generated images to Convex storage.
 */
class SlideImageGenerationService {
  private client: ZhipuAI;
  private uploadStorage: (buffer: Buffer, fileName: string) => Promise<string>;
  private maxRetries = 1; // Only 1 retry - ZhipuAI rate limits are very strict, retrying immediately doesn't help

  constructor(apiKey: string, uploadStorage: (buffer: Buffer, fileName: string) => Promise<string>) {
    if (!apiKey || apiKey.trim().length === 0) {
      logWarn({
        agent: 'SlideDeckGraph',
        phase: 'image_service_init',
      } as any, 'ZhipuAI API key not configured - image generation will be skipped');
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

    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'image_generation',
      slideNumber,
      promptLength: prompt.length,
    } as any, `Generating slide ${slideNumber} with ZhipuAI glm-image...`);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Call ZhipuAI glm-image API using SDK
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
              // Enhanced error handling for ZhipuAI SDK errors
              const errorMessage = apiError?.message || 
                                   apiError?.error?.message || 
                                   apiError?.response?.data?.error?.message ||
                                   String(apiError);
              throw new Error(`ZhipuAI API error: ${errorMessage}`);
            }
          },
          GRAPH_CONFIG.IMAGE_TIMEOUT_MS,
          'ZhipuAIImageGen'
        );

        // Extract image data from SDK response
        // The SDK may return data in different formats depending on version
        let imageUrl: string | undefined;
        const firstItem = response.data?.[0];
        
        // Check if response.data is an array of strings (URLs)
        if (typeof firstItem === 'string') {
          imageUrl = firstItem;
        }
        // Check if response.data is an array of objects with url property
        else if (typeof firstItem === 'object' && firstItem !== null && 'url' in firstItem) {
          imageUrl = (firstItem as { url: string }).url;
        }
        // Check if response.data is an array of objects with b64_json property
        else if (typeof firstItem === 'object' && firstItem !== null && 'b64_json' in firstItem) {
          throw new Error('ZhipuAI returned base64 image instead of URL - not yet supported');
        }
        
        if (!imageUrl || typeof imageUrl !== 'string') {
          throw new Error('Unexpected response format from ZhipuAI SDK: no image URL returned');
        }

        // Fetch the image from the URL
        const imageResponse = await fetch(imageUrl);
        
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image from URL: ${imageResponse.statusText}`);
        }
        const arrayBuffer = await imageResponse.arrayBuffer();
        const imageData = Buffer.from(arrayBuffer);

        const elapsed = Date.now() - startTime;
        logInfo({
          agent: 'SlideDeckGraph',
          phase: 'image_generation',
          slideNumber,
          attempt,
          imageSize: imageData.length,
          processingTimeMs: elapsed,
        } as any, `Slide ${slideNumber} generated successfully (${(imageData.length / 1024).toFixed(2)} KB)`);

        return imageData;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Properly extract error details
        let errorDetails: any;
        if (error instanceof Error) {
          errorDetails = { 
            message: error.message, 
            name: error.name, 
            stack: error.stack?.split('\n').slice(0, 3).join('\n') 
          };
        } else if (typeof error === 'object' && error !== null) {
          // Handle API error responses
          errorDetails = JSON.parse(JSON.stringify(error));
        } else {
          errorDetails = { error: String(error) };
        }
        
        logWarn({
          agent: 'SlideDeckGraph',
          phase: 'image_generation',
          slideNumber,
          attempt,
          error: errorDetails,
        } as any, `Attempt ${attempt}/${this.maxRetries} failed for slide ${slideNumber}: ${lastError.message}`);

        if (attempt < this.maxRetries) {
          // Exponential backoff with longer delays for rate limit errors
          const baseDelay = 2000; // Start with 2 seconds
          const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 15000);
          logInfo({
            agent: 'SlideDeckGraph',
            phase: 'image_generation',
            slideNumber,
            attempt,
            delayMs: delay,
          } as any, `Waiting ${delay}ms before retry ${attempt + 1}/${this.maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    logError({
      agent: 'SlideDeckGraph',
      phase: 'image_generation',
      slideNumber,
      error: lastError?.message,
    } as any, `Failed to generate slide ${slideNumber} after ${this.maxRetries} attempts`);

    throw lastError || new Error('Failed to generate slide image');
  }

  /**
   * Upload an image buffer to storage.
   * Returns the public URL of the uploaded image.
   */
  async uploadImage(imageBuffer: Buffer, slideNumber: number, slideDeckId: string): Promise<string> {
    const fileName = `slide-decks/${slideDeckId}/slide-${slideNumber}-${Date.now()}.png`;

    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'upload_image',
      slideNumber,
      fileName,
      fileSize: imageBuffer.length,
    } as any, `Uploading slide ${slideNumber} to storage...`);

    try {
      const publicUrl = await this.uploadStorage(imageBuffer, fileName);

      logInfo({
        agent: 'SlideDeckGraph',
        phase: 'upload_image',
        slideNumber,
        publicUrl,
      } as any, `Slide ${slideNumber} uploaded successfully`);

      return publicUrl;
    } catch (error) {
      logError({
        agent: 'SlideDeckGraph',
        phase: 'upload_image',
        slideNumber,
        error: error instanceof Error ? error.message : String(error),
      } as any, `Failed to upload slide ${slideNumber}`);

      throw error;
    }
  }

  /**
   * Generate all slide images sequentially with rate limiting.
   * Returns an array of slide objects with image URLs.
   * 
   * Note: Processes slides sequentially (concurrency=1) with delays to avoid ZhipuAI API rate limits.
   */
  async generateSlideImages(slides: Slide[], slideDeckId: string, concurrency: number = 1): Promise<Slide[]> {
    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'generate_slide_images',
      totalSlides: slides.length,
      concurrency,
    } as any, `Starting image generation for ${slides.length} slides...`);

    // Process slides sequentially with delay to avoid rate limiting
    // ZhipuAI rate limits reset during the ~70-80s image generation time
    // A small delay between requests provides additional safety margin
    const DELAY_BETWEEN_REQUESTS_MS = 10000; // 10 seconds between requests
    const results: Slide[] = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      
      try {
        // Add delay before each request (except the first one)
        if (i > 0) {
          logInfo({
            agent: 'SlideDeckGraph',
            phase: 'generate_slide_images',
            slideNumber: slide.slideNumber,
          } as any, `Waiting ${DELAY_BETWEEN_REQUESTS_MS}ms before generating slide ${slide.slideNumber}...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
        }

        // Generate image
        const imageBuffer = await this.generateSlideImage(slide.prompt, slide.slideNumber);

        // Upload to storage
        const imageUrl = await this.uploadImage(imageBuffer, slide.slideNumber, slideDeckId);

        results.push({
          ...slide,
          imageUrl,
        } as Slide);
      } catch (error) {
        logError({
          agent: 'SlideDeckGraph',
          phase: 'generate_slide_images',
          slideNumber: slide.slideNumber,
          slideTitle: slide.title,
          error: error instanceof Error ? error.message : String(error),
        } as any, `CRITICAL: Failed to generate image for slide ${slide.slideNumber}. Aborting slide deck generation.`);

        // Re-throw the error to fail the entire job - no fallbacks
        throw new Error(`Failed to generate image for slide ${slide.slideNumber} ("${slide.title}"): ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const successCount = results.filter(s => s.imageUrl && !s.imageUrl.includes('placeholder')).length;
    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'generate_slide_images',
      totalSlides: slides.length,
      successful: successCount,
      failed: slides.length - successCount,
    } as any, `Image generation complete: ${successCount}/${slides.length} slides generated`);

    return results;
  }
}

// ============================================================
// SLIDE DECK GRAPH CLASS
// ============================================================

/**
 * SlideDeckGraph class that orchestrates slide deck generation.
 * This is the main class that users interact with.
 * 
 * Uses two LLM models:
 * - FAST_LLM: For map phase (extracting slide concepts from chunks)
 * - SMART_LLM: For reduce phases (selection, refinement, image prompt generation)
 */
export class SlideDeckGraph {
  // Fast LLM for map phase (extracting concepts)
  private fastLlm: ChatTogetherAI;
  private fastLlmStructured: StructuredOutputInvoker<SlideCandidateResponse>;
  
  // Smart LLM for reduce phases (selection, refinement)
  private smartLlm: ChatTogetherAI;
  private smartLlmStructured: StructuredOutputInvoker<SlideCandidateResponse>;
  private slideStructured: StructuredOutputInvoker<Slide>;
  
  private imageService: SlideImageGenerationService;

  constructor(
    apiKey: string,
    fastModel: string,
    smartModel: string,
    zhipuAiApiKey: string,
    uploadStorage: (buffer: Buffer, fileName: string) => Promise<string>
  ) {
    // Fast LLM for map phase - quick extraction of concepts
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: fastModel,
      temperature: 0.4,
      maxTokens: GRAPH_CONFIG.MAX_TOKENS,
    });

    // Smart LLM for reduce phases - complex reasoning and prompt generation
    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: smartModel,
      temperature: 0.4,
      maxTokens: GRAPH_CONFIG.MAX_TOKENS,
    });

    // Create structured LLM instances for map phase (fast)
    this.fastLlmStructured = createStructuredLLM<SlideCandidateResponse>(
      this.fastLlm,
      SlideCandidateArraySchema,
      'slide_candidates'
    );

    // Create structured LLM instances for reduce phases (smart)
    this.smartLlmStructured = createStructuredLLM<SlideCandidateResponse>(
      this.smartLlm,
      SlideCandidateArraySchema,
      'slide_candidates'
    );

    this.slideStructured = createStructuredLLM<Slide>(
      this.smartLlm,
      SlideSchema,
      'slide'
    );

    // Initialize image generation service
    this.imageService = new SlideImageGenerationService(zhipuAiApiKey, uploadStorage);
  }

  private estimateTokens(text: string): number {
    return countTokens(text);
  }

  /**
   * Helper method to call the status update callback.
   * Safely invokes the callback if it exists.
   */
  private async callStatusUpdate(state: OverallStateType, phase: string): Promise<void> {
    if (state.onStatusUpdate) {
      try {
        await state.onStatusUpdate(phase);
      } catch (error) {
        console.error('[SlideDeckGraph] Status update callback error:', error);
      }
    }
  }

  // ============================================================
  // SLIDE SELECTION HELPER METHODS
  // ============================================================

  private heuristicDedupeSlides(slides: SlideCandidate[]): SlideCandidate[] {
    const SIMILARITY_THRESHOLD = 0.75;
    const toRemove = new Set<number>();

    for (let i = 0; i < slides.length; i++) {
      for (let j = i + 1; j < slides.length; j++) {
        const similarity = this.calculateSlideSimilarity(slides[i], slides[j]);
        if (similarity >= SIMILARITY_THRESHOLD) {
          toRemove.add(j);
        }
      }
    }

    const dedupedCount = slides.length - toRemove.size;
    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'heuristic_dedupe',
      inputCount: slides.length,
      outputCount: dedupedCount,
      duplicatesRemoved: toRemove.size,
    }, `Deduplication: ${slides.length} → ${dedupedCount} slides (${toRemove.size} duplicates removed)`);

    return slides.filter((_, idx) => !toRemove.has(idx));
  }

  private calculateSlideSimilarity(s1: SlideCandidate, s2: SlideCandidate): number {
    const text1 = `${s1.title} ${s1.content}`.toLowerCase();
    const text2 = `${s2.title} ${s2.content}`.toLowerCase();

    const stopWords = new Set(['the', 'is', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can']);

    const extractWords = (text: string): Set<string> => {
      const words = text.match(/\b\w+\b/g) || [];
      return new Set(words.filter(w => !stopWords.has(w)));
    };

    const words1 = extractWords(text1);
    const words2 = extractWords(text2);
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private preSelectSlides(slides: SlideCandidate[], maxSlides: number): SlideCandidate[] {
    if (slides.length <= maxSlides) {
      logInfo({
        agent: 'SlideDeckGraph',
        phase: 'pre_select',
        inputCount: slides.length,
        outputCount: slides.length,
        maxSlides,
      }, `Pre-select: ${slides.length} slides (within limit)`);
      return slides;
    }

    const grouped = this.groupSlidesByTopicForSelection(slides);
    const selected: SlideCandidate[] = [];
    const slidesPerTopic = Math.ceil(maxSlides / Object.keys(grouped).length);

    for (const topic of Object.keys(grouped)) {
      const shuffled = [...grouped[topic]].sort(() => Math.random() - 0.5);
      selected.push(...shuffled.slice(0, Math.min(slidesPerTopic, shuffled.length)));
    }

    const result = selected.slice(0, maxSlides);

    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'pre_select',
      inputCount: slides.length,
      outputCount: result.length,
      maxSlides,
      topicsFound: Object.keys(grouped).length,
    }, `Pre-select: ${slides.length} → ${result.length} slides (topic-based selection)`);

    return result;
  }

  private groupSlidesByTopicForSelection(slides: SlideCandidate[]): Record<string, SlideCandidate[]> {
    const groups: Record<string, SlideCandidate[]> = {};
    const patterns = {
      'Introduction/Foundation': ['introduction', 'overview', 'background', 'basics', 'foundation'],
      'Concepts/Definitions': ['definition', 'concept', 'what is', 'meaning', 'terminology'],
      'Processes/Methods': ['process', 'method', 'how to', 'approach', 'technique', 'strategy'],
      'Benefits/Justification': ['benefit', 'advantage', 'why', 'importance', 'value'],
      'Examples/Applications': ['example', 'application', 'use case', 'case study', 'illustration'],
      'Conclusion/Summary': ['conclusion', 'summary', 'final', 'wrap up', 'recap'],
      'Challenges/Problems': ['challenge', 'problem', 'issue', 'difficulty', 'obstacle'],
      'Future/Trends': ['future', 'trend', 'next', 'upcoming', 'emerging'],
    };

    for (const slide of slides) {
      let topic = 'General';
      const lower = slide.title.toLowerCase();
      for (const [key, keywords] of Object.entries(patterns)) {
        if (keywords.some(k => lower.includes(k))) {
          topic = key;
          break;
        }
      }
      if (!groups[topic]) groups[topic] = [];
      groups[topic].push(slide);
    }

    return groups;
  }

  private selectSlidesHeuristic(
    candidates: SlideCandidate[],
    targetCount: number,
    minSlides: number,
    maxSlides: number
  ): SlideCandidate[] {
    const grouped = this.groupSlidesByTopicForSelection(candidates);
    const topicOrder = ['Introduction/Foundation', 'Concepts/Definitions', 'Processes/Methods',
                        'Benefits/Justification', 'Examples/Applications', 'Challenges/Problems',
                        'Future/Trends', 'Conclusion/Summary'];

    const sortedTopics = Object.keys(grouped).sort((a, b) => {
      const idxA = topicOrder.indexOf(a);
      const idxB = topicOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const selected: SlideCandidate[] = [];
    const slidesPerTopic = Math.ceil(targetCount / sortedTopics.length);

    for (const topic of sortedTopics) {
      if (selected.length >= targetCount) break;
      const topicSlides = grouped[topic];
      const toTake = Math.min(slidesPerTopic, topicSlides.length, targetCount - selected.length);
      selected.push(...topicSlides.slice(0, toTake));
    }

    const result = selected.slice(0, maxSlides);

    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'heuristic_selection_fallback',
      inputCount: candidates.length,
      outputCount: result.length,
      targetCount,
      minSlides,
      maxSlides,
    }, `Heuristic fallback: ${candidates.length} → ${result.length} slides`);

    return result;
  }

  private async refineSelectedSlides(
    selectedCandidates: SlideCandidate[],
    state: OverallStateType,
    targetSlideCount: number
  ): Promise<Partial<OverallStateType>> {
    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'refine_slides',
      slidesToRefine: selectedCandidates.length,
    }, `Refining ${selectedCandidates.length} slides with image generation prompts...`);

    const refinedSlidesWithPrompts = await allWithConcurrency(
      selectedCandidates.slice(0, targetSlideCount).map((candidate, index) => {
        return async () => {
          try {
            const refinePrompt = getRefineSlidePrompt(candidate, index + 1, state.slideType);

            // Use SMART_LLM for refinement (complex prompt generation task)
            const refinedSlideRaw = await invokeWithRetry(
              () => invokeWithTimeout(
                () => (this.slideStructured as any).invoke([
                  new SystemMessage(REFINE_SLIDES_SYSTEM_PROMPT),
                  new HumanMessage(refinePrompt),
                ], createLangSmithRunConfig({
                  runName: 'SlideDeckGraph.RefineSlide',
                  tags: ['agent', 'slides', 'refine', 'smart-llm'],
                  metadata: {
                    slideNumber: index + 1,
                    slideType: state.slideType,
                  },
                })),
                GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
                'SlideRefine'
              ),
              {
                maxAttempts: 2,
                baseDelayMs: 1000,
              },
              'SlideRefine'
            );

            const refinedSlide = refinedSlideRaw as Slide;
            
            // Fix: LLM often returns slideNumber: 1 for all slides, so we explicitly set it here
            refinedSlide.slideNumber = index + 1;

            logInfo({
              agent: 'SlideDeckGraph',
              phase: 'refine_slide',
              slideNumber: index + 1,
            }, `Refined slide ${index + 1}: ${refinedSlide.title}`);

            return refinedSlide;
          } catch (error) {
            logError({
              agent: 'SlideDeckGraph',
              phase: 'refine_slide_failed',
              index,
              slideNumber: index + 1,
              candidateTitle: candidate.title,
              error: error instanceof Error ? error.message : String(error),
            }, `CRITICAL: Failed to refine slide ${index + 1}. Aborting slide deck generation.`);

            // Re-throw the error to fail the entire job - no fallbacks
            throw new Error(`Failed to refine slide ${index + 1} ("${candidate.title}"): ${error instanceof Error ? error.message : String(error)}`);
          }
        };
      }),
      5
    );

    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'reduce_complete',
      slidesWithPromptsCount: refinedSlidesWithPrompts.length,
    }, `Slide content generation complete: ${refinedSlidesWithPrompts.length} slides refined`);

    return {
      ...state,
      slidesWithPrompts: refinedSlidesWithPrompts,
      status: 'generating_images',
      ...clearStateKeys<OverallStateType>(['collapsedOutputs', 'chunks']),
      progress: {
        phase: 'reduce',
        percentage: 75,
        message: `Slide content ready: ${refinedSlidesWithPrompts.length} slides prepared for image generation`,
        itemsGenerated: refinedSlidesWithPrompts.length,
        totalItems: refinedSlidesWithPrompts.length,
      },
    };
  }

  // Node: Split chunks for routing
  private async splitChunks(state: OverallStateType): Promise<Partial<OverallStateType>> {
    console.log('\n' + '='.repeat(80));
    console.log('[SlideDeckGraph] ===== SPLIT CHUNKS PHASE =====');
    console.log('='.repeat(80));
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'split_chunks',
      documentCount: state.documentIds?.length || 0,
      documentIds: state.documentIds || [],
      chunkCount: state.chunks?.length || 0,
      slideType: state.slideType,
      deckLength: state.deckLength,
      customPrompt: state.customPrompt || 'none',
    }, null, 2));

    // Call status update callback
    await this.callStatusUpdate(state, 'split_chunks');

    return {
      ...state,
      status: 'mapping',
      mapOutputs: state.mapOutputs || [],
      collapsedOutputs: state.collapsedOutputs || [],
      finalOutput: state.finalOutput || [],
      progress: {
        phase: 'split_chunks',
        percentage: 5,
        message: `Preparing ${state.chunks?.length || 0} chunks for processing`,
        totalChunks: state.chunks?.length || 0,
      },
    };
  }

  // Conditional routing function
  private routeToMap(state: OverallStateType): Send[] | 'collapse' {
    console.log('\n' + '='.repeat(80));
    console.log('[SlideDeckGraph] ===== ROUTE TO MAP PHASE =====');
    console.log('='.repeat(80));

    if (state.chunks.length === 0) {
      console.warn('[SlideDeckGraph] No chunks to process, routing to collapse');
      return 'collapse';
    }

    const validatedChunks = validateChunks(state.chunks);
    const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS);

    // Get target slide count range
    const countRange = SLIDE_COUNT_MAP[state.deckLength];
    const targetSlideCount = Math.floor((countRange.min + countRange.max) / 2);

    const MIN_SLIDES_PER_CHUNK = GRAPH_CONFIG.MIN_SLIDES_PER_CHUNK;
    const BUFFER_MULTIPLIER = 1.3;
    const MAX_SLIDES_PER_CHUNK = GRAPH_CONFIG.MAX_SLIDES_PER_CHUNK;

    // Calculate slides per chunk
    const slidesPerChunk = Math.max(
      MIN_SLIDES_PER_CHUNK,
      Math.min(
        MAX_SLIDES_PER_CHUNK,
        Math.ceil(targetSlideCount / packedChunks.length * BUFFER_MULTIPLIER)
      )
    );

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'route_to_map',
      originalChunks: state.chunks.length,
      validatedChunks: validatedChunks.length,
      packedChunks: packedChunks.length,
      slideType: state.slideType,
      deckLength: state.deckLength,
      targetSlideCount,
      slidesPerChunk,
    }, null, 2));

    console.log(`[SlideDeckGraph] Creating ${packedChunks.length} parallel map tasks (~${slidesPerChunk} slides/chunk)`);

    return packedChunks.map((chunk, idx) => {
      const chunkTokens = this.estimateTokens(chunk);
      const preview = chunk.substring(0, 100).replace(/\n/g, ' ');
      console.log(`  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (~${chunkTokens} tokens)`);
      return new Send('map_process', {
        chunk,
        chunkIndex: idx,
        slideType: state.slideType,
        deckLength: state.deckLength,
        customPrompt: state.customPrompt,
        slidesPerChunk,
        targetSlideCount,
      });
    });
  }

  // Node: Map phase (runs in parallel via Send)
  async mapProcess(state: ChunkProcessState): Promise<Partial<OverallStateType>> {
    const { chunk, chunkIndex, slideType, deckLength, customPrompt, slidesPerChunk } = state;
    const startTime = Date.now();

    const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : '[Chunk ?]';

    logPhaseStart({
      agent: 'SlideDeckGraph',
      phase: 'map_process',
      chunkIndex,
      chunkTokens: this.estimateTokens(chunk),
      chunkPreview: chunk.substring(0, 150).replace(/\n/g, ' '),
      slideType,
      deckLength,
      slidesPerChunkTarget: slidesPerChunk,
    });

    const sanitizedCustomPrompt = customPrompt ? sanitizeUserInput(customPrompt) : undefined;
    const prompt = getCandidateMapPrompt({
      chunk,
      slidesPerChunk,
      slideType,
      deckLength,
      customPrompt: sanitizedCustomPrompt,
    });

    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'map_process',
      chunkId,
      promptTokens: this.estimateTokens(prompt),
    }, `Sending prompt to LLM (~${this.estimateTokens(prompt)} tokens)...`);

    let output: string;
    let slidesGenerated = 0;

    try {
      // Use FAST_LLM for map phase (extracting concepts from chunks)
      const response: SlideCandidateResponse = await invokeWithRetry(
        () => invokeWithTimeout(
          () => (this.fastLlmStructured as any).invoke([
            new SystemMessage(MAP_CONCEPTS_SYSTEM_PROMPT),
            new HumanMessage(prompt),
          ], createLangSmithRunConfig({
            runName: 'SlideDeckGraph.MapConcepts',
            tags: ['agent', 'slides', 'map', 'fast-llm'],
            metadata: {
              chunkIndex,
              slideType,
              deckLength,
              slidesPerChunk,
            },
          })),
          GRAPH_CONFIG.MAP_TIMEOUT_MS,
          'SlideMap'
        ),
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          onRetry: (attempt, error) => {
            logWarn({
              agent: 'SlideDeckGraph',
              phase: 'map_process',
              chunkIndex,
              attempt,
              error: error.message,
            }, `Retry attempt ${attempt}/3`);
          }
        },
        'SlideMap'
      );

      slidesGenerated = response.slides.length;
      output = JSON.stringify(response.slides);
    } catch (error) {
      const errorContext = {
        agent: 'SlideDeckGraph',
        phase: 'map_process',
        chunkIndex,
        chunkLength: chunk.length,
        slideType,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        } : String(error),
      };

      logError(errorContext, 'Map process failed');

      output = '[]';
      slidesGenerated = 0;
    }

    const elapsed = Date.now() - startTime;

    logPhaseComplete({
      agent: 'SlideDeckGraph',
      phase: 'map_process',
      chunkIndex,
      outputTokens: this.estimateTokens(output),
      slidesGenerated,
      processingTimeMs: elapsed,
    });

    return {
      mapOutputs: [output],
      progress: {
        phase: 'map_process',
        percentage: Math.min(10 + ((chunkIndex ?? 0) * 30), 60),
        message: `Chunk ${(chunkIndex ?? 0) + 1} complete: ${slidesGenerated} slide concepts`,
        chunksCompleted: (chunkIndex ?? 0) + 1,
      },
    };
  }

  // Node: Collapse phase
  private async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
    console.log(`\n${'='.repeat(80)}`);
    console.log('[SlideDeckGraph] ===== COLLAPSE PHASE =====');
    console.log('='.repeat(80));

    const mapOutputsDetails = state.mapOutputs.map((output, idx) => {
      let slides = 0;
      try {
        const parsed = JSON.parse(output) as SlideCandidate[];
        slides = parsed.length;
      } catch {
        slides = 0;
      }
      return {
        index: idx,
        tokens: this.estimateTokens(output),
        slides,
        preview: output.substring(0, 100).replace(/\n/g, ' '),
      };
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'collapse',
      mapOutputsReceived: state.mapOutputs.length,
      mapOutputsDetails,
    }, null, 2));

    if (!state.mapOutputs || state.mapOutputs.length === 0) {
      logError({
        agent: 'SlideDeckGraph',
        phase: 'collapse',
        error: 'No mapOutputs received',
      }, 'Collapse: ERROR - No mapOutputs received!');
      await this.callStatusUpdate(state, 'collapsing');
      return {
        ...state,
        collapsedOutputs: [],
        status: 'reducing',
      };
    }

    const totalTokens = state.mapOutputs.reduce(
      (sum, s) => sum + this.estimateTokens(s),
      0
    );

    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'collapse',
      totalTokens,
      reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
    }, `Total tokens: ${totalTokens}, Reduce chunk size: ${GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS} tokens`);

    // Call status update callback
    await this.callStatusUpdate(state, 'collapsing');

    if (totalTokens <= GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
      logInfo({
        agent: 'SlideDeckGraph',
        phase: 'collapse_skip',
        totalTokens,
        reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
      }, 'Collapse: skipping recursive collapse, using mapOutputs directly');

      const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
      logInfo({
        agent: 'SlideDeckGraph',
        phase: 'collapse_cleanup',
        memoryFreedKB: (mapOutputsSize / 1024).toFixed(2),
      }, `Freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`);

      return {
        ...state,
        collapsedOutputs: state.mapOutputs,
        status: 'reducing',
        ...clearStateKeys<OverallStateType>(['mapOutputs']),
        progress: {
          phase: 'collapse',
          percentage: 70,
          message: `Collected ${state.mapOutputs.length} chunk outputs`,
        },
      };
    }

    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'collapse_recursive',
      totalTokens,
      reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
    }, 'Collapse: performing recursive collapse');
    const collapsed = await this.recursiveCollapse(state.mapOutputs);

    const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'collapse_cleanup',
      memoryFreedKB: (mapOutputsSize / 1024).toFixed(2),
    }, `Freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`);

    return {
      ...state,
      collapsedOutputs: collapsed,
      status: 'reducing',
      ...clearStateKeys<OverallStateType>(['mapOutputs']),
      progress: {
        phase: 'collapse',
        percentage: 70,
        message: `Collapsed ${state.mapOutputs.length} outputs into ${collapsed.length}`,
      },
    };
  }

  private async recursiveCollapse(outputs: string[], depth: number = 0): Promise<string[]> {
    if (depth >= GRAPH_CONFIG.MAX_COLLAPSE_DEPTH) {
      logWarn({
        agent: 'SlideDeckGraph',
        phase: 'recursive_collapse',
        depth,
        maxDepth: GRAPH_CONFIG.MAX_COLLAPSE_DEPTH,
        outputCount: outputs.length,
      }, `Max collapse depth (${GRAPH_CONFIG.MAX_COLLAPSE_DEPTH}) reached, returning current outputs`);
      return outputs;
    }

    const totalTokens = outputs.reduce(
      (sum, s) => sum + this.estimateTokens(s),
      0
    );

    if (totalTokens <= GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
      return outputs;
    }

    const targetGroupTokens = GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS * 0.8;
    const collapsed: string[] = [];
    let currentGroup: string[] = [];
    let currentTokens = 0;

    for (const output of outputs) {
      const tokens = this.estimateTokens(output);
      if (currentTokens + tokens > targetGroupTokens && currentGroup.length > 0) {
        collapsed.push(await this.collapseGroup(currentGroup));
        currentGroup = [output];
        currentTokens = tokens;
      } else {
        currentGroup.push(output);
        currentTokens += tokens;
      }
    }

    if (currentGroup.length > 0) {
      collapsed.push(await this.collapseGroup(currentGroup));
    }

    return this.recursiveCollapse(collapsed, depth + 1);
  }

  private async collapseGroup(group: string[]): Promise<string> {
    // Flatten all slide arrays
    const allSlides: SlideCandidate[] = [];
    for (const output of group) {
      try {
        const parsed = JSON.parse(output) as SlideCandidate[];
        allSlides.push(...parsed);
      } catch (e) {
        logWarn({
          agent: 'SlideDeckGraph',
          phase: 'collapse_group_parse_error',
          error: e instanceof Error ? e.message : String(e),
        }, 'Failed to parse slide array in collapseGroup');
      }
    }

    // Simple deduplication by title
    const seen = new Set<string>();
    const uniqueSlides = allSlides.filter(slide => {
      const key = slide.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'collapse_group',
      inputSlides: allSlides.length,
      uniqueSlides: uniqueSlides.length,
    }, `Collapsed ${allSlides.length} → ${uniqueSlides.length} unique slides`);

    return JSON.stringify(uniqueSlides);
  }

  // Node: Reduce phase - multi-stage intelligent slide selection with image generation
  private async reduce(state: OverallStateType): Promise<Partial<OverallStateType>> {
    // Call status update callback
    await this.callStatusUpdate(state, 'reducing');

    logPhaseStart({
      agent: 'SlideDeckGraph',
      phase: 'reduce',
      collapsedOutputsCount: state.collapsedOutputs.length,
      slideType: state.slideType,
      deckLength: state.deckLength,
    });

    // Collect all candidates
    const allCandidates: SlideCandidate[] = [];
    for (const output of state.collapsedOutputs) {
      try {
        const parsed = JSON.parse(output) as SlideCandidate[];
        allCandidates.push(...parsed);
      } catch (e) {
        logWarn({
          agent: 'SlideDeckGraph',
          phase: 'reduce_parse_error',
          error: e instanceof Error ? e.message : String(e),
        }, 'Failed to parse slide array in reduce');
      }
    }

    if (allCandidates.length === 0) {
      logError({
        agent: 'SlideDeckGraph',
        phase: 'reduce',
        error: 'No candidates generated',
      }, 'CRITICAL: No candidates in collapsed outputs!');
      return {
        ...state,
        slidesWithPrompts: [],
        finalOutput: [],
        status: 'failed',
      };
    }

    const countRange = SLIDE_COUNT_MAP[state.deckLength];
    const minSlides = countRange.min;
    const maxSlides = countRange.max;
    const targetSlideCount = Math.floor((minSlides + maxSlides) / 2);

    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'reduce_initial',
      totalCandidates: allCandidates.length,
      minSlides,
      maxSlides,
      targetSlideCount,
    }, `Collected ${allCandidates.length} candidates, targeting ${targetSlideCount} slides`);

    // Skip LLM if few candidates
    if (allCandidates.length <= maxSlides) {
      logInfo({
        agent: 'SlideDeckGraph',
        phase: 'reduce_skip_llm',
        candidateCount: allCandidates.length,
        maxSlides,
      }, `Skipping LLM selection: ${allCandidates.length} candidates within limit`);
      return this.refineSelectedSlides(allCandidates, state, targetSlideCount);
    }

    // Stage 1: Heuristic deduplication
    const dedupedSlides = this.heuristicDedupeSlides(allCandidates);

    // Stage 2: Pre-select for LLM (max 30)
    const preSelectedSlides = this.preSelectSlides(dedupedSlides, 30);

    // Stage 3: LLM selection using SMART_LLM
    try {
      // Use SMART_LLM for selection (complex reasoning task)
      const selectionStructuredLLM = this.smartLlm.withStructuredOutput<SlideSelectionResponse>(
        SlideSelectionSchema,
        { name: 'slide_selection' }
      );

      const selectionPrompt = getSlideSelectionPrompt({
        candidates: preSelectedSlides,
        minSlides,
        maxSlides,
        slideType: state.slideType,
        deckLength: state.deckLength,
      });

      const response: SlideSelectionResponse = await invokeWithRetry(
        () => invokeWithTimeout(
          () => (selectionStructuredLLM as any).invoke([
            new SystemMessage(SLIDE_SELECTION_SYSTEM_PROMPT),
            new HumanMessage(selectionPrompt),
          ], createLangSmithRunConfig({
            runName: 'SlideDeckGraph.SelectSlides',
            tags: ['agent', 'slides', 'select', 'smart-llm'],
          })),
          GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
          'SlideSelection'
        ),
        { maxAttempts: 2, baseDelayMs: 1000 },
        'SlideSelection'
      );

      logInfo({
        agent: 'SlideDeckGraph',
        phase: 'reduce_llm_selection',
        inputSlides: preSelectedSlides.length,
        outputSlides: response.slides.length,
        reasoning: response.reasoning,
      }, `LLM selection: ${preSelectedSlides.length} → ${response.slides.length} slides`);

      return this.refineSelectedSlides(response.slides, state, targetSlideCount);
    } catch (error) {
      // Fallback to heuristic selection
      logWarn({
        agent: 'SlideDeckGraph',
        phase: 'reduce_llm_failed',
        error: error instanceof Error ? error.message : String(error),
      }, 'LLM selection failed, using heuristic fallback');

      const fallbackSlides = this.selectSlidesHeuristic(preSelectedSlides, targetSlideCount, minSlides, maxSlides);
      return this.refineSelectedSlides(fallbackSlides, state, targetSlideCount);
    }
  }

  // Node: Generate images phase - generates images for slides with prompts
  private async generateImages(state: OverallStateType): Promise<Partial<OverallStateType>> {
    // Call status update callback
    await this.callStatusUpdate(state, 'generating_images');

    logPhaseStart({
      agent: 'SlideDeckGraph',
      phase: 'generate_images',
      slidesToProcess: state.slidesWithPrompts.length,
    });

    if (!state.slidesWithPrompts || state.slidesWithPrompts.length === 0) {
      logError({
        agent: 'SlideDeckGraph',
        phase: 'generate_images',
        error: 'No slides with prompts',
      }, 'CRITICAL: No slides with prompts to generate images for!');
      await this.callStatusUpdate(state, 'failed');
      return {
        ...state,
        finalOutput: [],
        status: 'failed',
      };
    }

    // Reduced concurrency to 1 to avoid ZhipuAI API rate limits
    const imageConcurrency = 1;

    logInfo({
      agent: 'SlideDeckGraph',
      phase: 'generate_images',
      totalSlides: state.slidesWithPrompts.length,
      concurrency: imageConcurrency,
    }, `Starting image generation for ${state.slidesWithPrompts.length} slides...`);

    const tempSlideDeckId = `temp-${Date.now()}`;
    const slidesWithImages = await this.imageService.generateSlideImages(
      state.slidesWithPrompts,
      tempSlideDeckId,
      imageConcurrency
    );

    logBanner(
      {
        agent: 'SlideDeckGraph',
        phase: 'generation_complete',
        finalSlideCount: slidesWithImages.length,
      },
      'SLIDE DECK GENERATION COMPLETE'
    );

    return {
      ...state,
      finalOutput: slidesWithImages,
      status: 'completed',
      ...clearStateKeys<OverallStateType>(['slidesWithPrompts']),
      progress: {
        phase: 'generate_images',
        percentage: 100,
        message: `Completed: ${slidesWithImages.length} slides generated`,
        itemsGenerated: slidesWithImages.length,
        totalItems: slidesWithImages.length,
      },
    };
  }

  /**
   * Build the state graph for slide deck generation.
   */
  buildGraph() {
    const builder = new StateGraph(OverallState);

    builder.addNode('split_chunks', (s: OverallStateType) => this.splitChunks(s));
    builder.addNode('map_process', (s: ChunkProcessState) => this.mapProcess(s));
    builder.addNode('collapse', (s: OverallStateType) => this.collapse(s));
    builder.addNode('reduce', (s: OverallStateType) => this.reduce(s));
    builder.addNode('generate_images', (s: OverallStateType) => this.generateImages(s));

    builder.addEdge(START, 'split_chunks' as any);

    builder.addConditionalEdges(
      'split_chunks' as any,
      (s: OverallStateType) => this.routeToMap(s),
      { map_process: 'map_process', collapse: 'collapse' } as any
    );

    builder.addEdge('map_process' as any, 'collapse' as any);
    builder.addEdge('collapse' as any, 'reduce' as any);
    builder.addEdge('reduce' as any, 'generate_images' as any);
    builder.addEdge('generate_images' as any, END as any);

    return builder.compile();
  }
}

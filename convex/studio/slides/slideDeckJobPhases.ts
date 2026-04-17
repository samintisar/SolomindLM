"use node";
/**
 * Slide deck generation — phase logic.
 * @see ./job.ts for Convex `internalAction` registrations.
 */

import type { ActionCtx } from '../../_generated/server';
import type { Id } from '../../_generated/dataModel';
import { internal } from '../../_generated/api';
import { packChunks, validateChunks } from '../../_agents/SlideDeckGraph';
import { env } from '../../_lib/env';
import {
  createJobLogger,
  createErrorMetadata,
} from '../../_agents/_shared/logging';
import { mergeModelKwargs } from '../../_agents/_shared/llm_factory';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import OpenAI from 'openai';
import {
  getCandidateMapPrompt,
  getSlideSelectionPrompt,
  getRefineSlidePrompt,
  SlideCandidateArraySchema,
  SlideSchema,
  SlideSelectionSchema,
  MAP_CONCEPTS_SYSTEM_PROMPT,
  REFINE_SLIDES_SYSTEM_PROMPT,
  SLIDE_SELECTION_SYSTEM_PROMPT,
  SLIDE_COUNT_MAP,
  type SlideCandidate,
  type SlideCandidateResponse,
  type Slide,
  type SlideSelectionResponse,
} from '../../_agents/slides/prompts';
import {
  invokeWithTimeout,
  allWithConcurrency,
} from '../../_agents/_shared/index';
import { invokeStudioLlm, createLangSmithRunConfig } from '../_job/invokeStudioLlm';

// ============================================================
// SCHEMAS
// ============================================================

// Interface for the structured LLM to avoid deep type instantiation
interface SlideCandidateOutputInvoker {
  invoke(messages: Array<SystemMessage | HumanMessage>, config?: any): Promise<SlideCandidateResponse>;
}

interface SlideOutputInvoker {
  invoke(messages: Array<SystemMessage | HumanMessage>, config?: any): Promise<Slide>;
}

interface SlideSelectionOutputInvoker {
  invoke(messages: Array<SystemMessage | HumanMessage>, config?: any): Promise<SlideSelectionResponse>;
}

// Helper function to create a structured LLM without triggering deep type instantiation
function createCandidateLLM(llm: ChatTogetherAI): SlideCandidateOutputInvoker {
  return llm.withStructuredOutput(SlideCandidateArraySchema, {
    name: 'slide_candidates',
  });
}

function createSlideLLM(llm: ChatTogetherAI): SlideOutputInvoker {
  return llm.withStructuredOutput(SlideSchema, {
    name: 'slide',
  });
}

function createSelectionLLM(llm: ChatTogetherAI): SlideSelectionOutputInvoker {
  return llm.withStructuredOutput(SlideSelectionSchema, {
    name: 'slide_selection',
  });
}

export type SlideDeckGenerationPhaseArgs = {
  slideDeckId: Id<'slides'>;
  userId: string;
  notebookId: Id<'notebooks'>;
  documentIds: Id<'documents'>[];
  slideCount: number;
};

export type ProcessSlideDeckMapChunkPhaseArgs = {
  slideDeckId: Id<'slides'>;
  userId: string;
  notebookId: Id<'notebooks'>;
  chunkIndex: number;
  totalChunks: number;
  chunk: string;
  slideCount: number;
  slidesPerChunk: number;
  deckLength: string;
};

export type FinalizeSlideDeckPhaseArgs = {
  slideDeckId: Id<'slides'>;
  userId: string;
  notebookId: Id<'notebooks'>;
  slideCount: number;
  deckLength: string;
};

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.SLIDES_MAP_CHUNK_TOKENS || '3000', 10),
  PER_CHUNK_TIMEOUT_MS: 90000, // 90 seconds per chunk (under 100s Cloudflare limit)
  REDUCE_TIMEOUT_MS: 120000, // 120 seconds for reduce
  REFINE_TIMEOUT_MS: 90000, // 90 seconds per slide refinement
  IMAGE_TIMEOUT_MS: parseInt(env.SLIDES_IMAGE_TIMEOUT_MS || '180000', 10), // 3 minutes per image (gpt-image-1.5 can be slow)
  MIN_SLIDES_PER_CHUNK: parseInt(env.SLIDES_MIN_SLIDES_PER_CHUNK || '1', 10),
  MAX_SLIDES_PER_CHUNK: parseInt(env.SLIDES_MAX_SLIDES_PER_CHUNK || '6', 10),
  BUFFER_MULTIPLIER: 1.3,
  REFINE_CONCURRENCY: 5,
  IMAGE_DELAY_MS: 10000, // 10 seconds between image requests for rate limiting
} as const;

// ============================================================
// HELPER: Create structured LLM for map phase
// ============================================================

function createMapLLM(): ChatTogetherAI {
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model: env.FAST_LLM,
    temperature: 0.4,
    timeout: CONFIG.PER_CHUNK_TIMEOUT_MS,
    modelKwargs: mergeModelKwargs(env.FAST_LLM, 'fast'),
    maxTokens: parseInt(env.SLIDES_MAX_TOKENS || '8000', 10),
  });
}

function createReduceLLM(): ChatTogetherAI {
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model: env.SMART_LLM,
    temperature: 0.3,
    timeout: CONFIG.REDUCE_TIMEOUT_MS,
    maxTokens: parseInt(env.SLIDES_MAX_TOKENS || '8000', 10),
    modelKwargs: mergeModelKwargs(env.SMART_LLM, 'smart'),
  });
}

function createRefineLLM(): ChatTogetherAI {
  return new ChatTogetherAI({
    apiKey: env.TOGETHER_AI_API_KEY,
    model: env.SMART_LLM,
    temperature: 0.4,
    timeout: CONFIG.REFINE_TIMEOUT_MS,
    maxTokens: parseInt(env.SLIDES_MAX_TOKENS || '8000', 10),
    modelKwargs: mergeModelKwargs(env.SMART_LLM, 'smart'),
  });
}

// ============================================================
// IMAGE GENERATION SERVICE
// ============================================================

/**
 * Generate a slide image using OpenAI gpt-image-1.5 model.
 */
async function generateSlideImage(
  client: OpenAI,
  prompt: string,
  slideNumber: number
): Promise<Buffer> {
  const startTime = Date.now();

  console.log(`[SlideDeckJob] Generating slide ${slideNumber} with OpenAI gpt-image-1.5...`);

  const response = await invokeWithTimeout(
    async () => {
      try {
        return await client.images.generate({
          model: 'gpt-image-1.5',
          prompt: prompt,
          size: '1536x1024',
          quality: 'medium',
          n: 1,
        });
      } catch (apiError: any) {
        const errorMessage = apiError?.message ||
          apiError?.error?.message ||
          apiError?.response?.data?.error?.message ||
          String(apiError);
        throw new Error(`OpenAI API error: ${errorMessage}`, { cause: apiError });
      }
    },
    CONFIG.IMAGE_TIMEOUT_MS,
    'OpenAIImageGen'
  );

  // Extract image data from SDK response (gpt-image-1.5 returns base64)
  const firstItem = response.data?.[0];
  let imageData: Buffer;

  if (typeof firstItem === 'object' && firstItem !== null && 'b64_json' in firstItem) {
    // Handle base64 response (gpt-image-1.5 default)
    const base64Data = (firstItem as { b64_json: string }).b64_json;
    if (typeof base64Data === 'string') {
      imageData = Buffer.from(base64Data, 'base64');
    } else {
      throw new Error('Unexpected response format from OpenAI SDK: invalid b64_json');
    }
  } else if (typeof firstItem === 'object' && firstItem !== null && 'url' in firstItem) {
    // Handle URL response (fallback for other models)
    const imageUrl = (firstItem as { url: string }).url;
    if (typeof imageUrl === 'string') {
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from URL: ${imageResponse.statusText}`);
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      imageData = Buffer.from(arrayBuffer);
    } else {
      throw new Error('Unexpected response format from OpenAI SDK: invalid url');
    }
  } else if (typeof firstItem === 'string') {
    // Handle string URL response (legacy format)
    const imageResponse = await fetch(firstItem);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image from URL: ${firstItem}`);
    }
    const arrayBuffer = await imageResponse.arrayBuffer();
    imageData = Buffer.from(arrayBuffer);
  } else {
    throw new Error('Unexpected response format from OpenAI SDK: no url or b64_json returned');
  }

  const elapsed = Date.now() - startTime;
  console.log(`[SlideDeckJob] Slide ${slideNumber} generated in ${elapsed}ms (${(imageData.length / 1024).toFixed(2)} KB)`);

  return imageData;
}

// ============================================================
// SLIDE SELECTION HELPERS
// ============================================================

function heuristicDedupeSlides(slides: SlideCandidate[]): SlideCandidate[] {
  const SIMILARITY_THRESHOLD = 0.75;
  const toRemove = new Set<number>();

  for (let i = 0; i < slides.length; i++) {
    for (let j = i + 1; j < slides.length; j++) {
      const similarity = calculateSlideSimilarity(slides[i], slides[j]);
      if (similarity >= SIMILARITY_THRESHOLD) {
        toRemove.add(j);
      }
    }
  }

  return slides.filter((_, idx) => !toRemove.has(idx));
}

function calculateSlideSimilarity(s1: SlideCandidate, s2: SlideCandidate): number {
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

function selectSlidesHeuristic(
  candidates: SlideCandidate[],
  targetCount: number,
  minSlides: number,
  maxSlides: number
): SlideCandidate[] {
  const grouped = groupSlidesByTopic(candidates);
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

  return selected.slice(0, maxSlides);
}

function groupSlidesByTopic(slides: SlideCandidate[]): Record<string, SlideCandidate[]> {
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

// ============================================================
// PHASE 1: Initialize & Schedule Map Tasks
// ============================================================

export async function runSlideDeckGenerationPhase(
  ctx: ActionCtx,
  args: SlideDeckGenerationPhaseArgs,
): Promise<void> {
    "use node";

    const { slideDeckId, userId, notebookId, documentIds, slideCount } = args;

    // Initialize structured logger
    const logger = createJobLogger({
      jobType: 'slides',
      jobId: slideDeckId,
      notebookId,
      userId,
    });

    logger.jobStart({
      slideCount,
      docCount: documentIds.length,
    });

    try {
      // Phase: Initializing
      logger.phaseStart('initializing', { progress: 5 });
      await ctx.runMutation(internal.studio.jobMutations.slides.updateSlideDeckStatus, {
        slideDeckId,
        status: 'generating',
        metadata: {
          phase: 'initializing',
          progress: 5,
          currentStep: 'Initializing...',
        },
      });
      logger.phaseComplete('initializing');

      // Phase: Loading documents
      logger.phaseStart('loading_documents', { progress: 15, docCount: documentIds.length });
      await ctx.runMutation(internal.studio.jobMutations.slides.updateSlideDeckStatus, {
        slideDeckId,
        status: 'generating',
        metadata: {
          phase: 'loading_documents',
          progress: 15,
          currentStep: 'Loading documents...',
        },
      });

      // Get document chunks
      const chunkObjects = await ctx.runAction(internal.documents.index.fetchChunks, {
        documentIds,
      });

      // Extract content from chunk objects
      const rawChunks = chunkObjects.map((chunk: any) => chunk.content);

      logger.phaseComplete('loading_documents', { chunkCount: rawChunks.length });

      // Validate and pack chunks
      const validatedChunks = validateChunks(rawChunks);
      const packedChunks = packChunks(validatedChunks, CONFIG.MAP_CHUNK_SIZE_TOKENS);

      console.log(`[SlideDeckJob] Packed ${rawChunks.length} chunks into ${packedChunks.length} map tasks`);

      if (packedChunks.length === 0) {
        throw new Error('No valid chunks to process');
      }

      // Determine deck length based on slide count
      const deckLength: 'short' | 'default' = slideCount <= 6 ? 'short' : 'default';
      const countRange = SLIDE_COUNT_MAP[deckLength];
      const targetSlideCount = Math.floor((countRange.min + countRange.max) / 2);

      // Calculate slides per chunk
      const slidesPerChunk = Math.max(
        CONFIG.MIN_SLIDES_PER_CHUNK,
        Math.min(
          CONFIG.MAX_SLIDES_PER_CHUNK,
          Math.ceil(targetSlideCount / packedChunks.length * CONFIG.BUFFER_MULTIPLIER)
        )
      );

      console.log(`[SlideDeckJob] Slides per chunk: ${slidesPerChunk}, deck length: ${deckLength}`);

      // Initialize map phase metadata
      await ctx.runMutation(internal.studio.jobMutations.slides.initSlideDeckMapPhase, {
        slideDeckId,
        totalMapTasks: packedChunks.length,
        slideCount,
      });

      // Schedule each map task as a separate action
      for (let i = 0; i < packedChunks.length; i++) {
        await ctx.scheduler.runAfter(0, internal.studio.slides.job.processSlideDeckMapChunk, {
          slideDeckId,
          userId,
          notebookId,
          chunkIndex: i,
          totalChunks: packedChunks.length,
          chunk: packedChunks[i],
          slideCount,
          slidesPerChunk,
          deckLength,
        });
        console.log(`[SlideDeckJob] Scheduled map task ${i + 1}/${packedChunks.length}`);
      }

      logger.info('Map phase initialized', {
        totalMapTasks: packedChunks.length,
        chunkSizes: packedChunks.map(c => c.length),
        slidesPerChunk,
      });

    } catch (error) {
      const errorMeta = createErrorMetadata(error, 'initializing');

      logger.jobError(error, {
        phase: 'initializing',
        errorType: errorMeta.type,
        retryable: errorMeta.retryable,
      });

      await ctx.runMutation(internal.studio.jobMutations.slides.markSlideDeckFailed, {
        slideDeckId,
        error: errorMeta.message,
        metadata: {
          phase: 'failed',
          progress: 0,
          failedAt: Date.now(),
          errorPhase: 'initializing',
          errorType: errorMeta.type,
          retryable: errorMeta.retryable,
          stack: errorMeta.stackTrace,
        },
      });

      throw error;
    }
}

// ============================================================
// PHASE 2: Process Individual Map Chunk
// ============================================================

export async function runProcessSlideDeckMapChunkPhase(
  ctx: ActionCtx,
  args: ProcessSlideDeckMapChunkPhaseArgs,
): Promise<void> {
    "use node";

    const { slideDeckId, userId, notebookId, chunkIndex, totalChunks, chunk, slideCount, slidesPerChunk, deckLength } = args;

    const logger = createJobLogger({
      jobType: 'slides',
      jobId: slideDeckId,
      notebookId,
      userId,
    });

    const chunkId = `[Chunk ${chunkIndex + 1}/${totalChunks}]`;
    console.log(`[SlideDeckJob] ${chunkId} Starting map processing`);

    try {
      // Check if slide deck still exists
      const slideDeck = await ctx.runQuery(internal.studio.slides.index.getInternal, { id: slideDeckId });
      if (!slideDeck) {
        console.log(`[SlideDeckJob] ${chunkId} Slide deck deleted, skipping`);
        return;
      }

      // Process with LLM using structured output
      const llm = createMapLLM();
      const structuredLLM = createCandidateLLM(llm);

      const prompt = getCandidateMapPrompt({
        chunk,
        slidesPerChunk,
        slideType: 'detailed_deck',
        deckLength: deckLength as 'short' | 'default',
      });

      console.log(`[SlideDeckJob] ${chunkId} Calling LLM (${prompt.length} chars)`);

      const startTime = Date.now();
      const response = await invokeStudioLlm({
        invoke: () =>
          (structuredLLM as any).invoke(
            [new SystemMessage(MAP_CONCEPTS_SYSTEM_PROMPT), new HumanMessage(prompt)],
            createLangSmithRunConfig({
              runName: 'SlideDeckJob.MapConcepts',
              tags: ['agent', 'slides', 'map'],
              metadata: {
                chunkIndex,
                slidesPerChunk,
                deckLength,
              },
            })
          ),
        timeoutMs: CONFIG.PER_CHUNK_TIMEOUT_MS,
        phaseLabel: 'SlideDeckMap',
        onRetry: (attempt, error) => {
          console.log(`[SlideDeckJob] ${chunkId} Retry attempt ${attempt}/3: ${error.message}`);
        },
      });

      const elapsed = Date.now() - startTime;
      console.log(`[SlideDeckJob] ${chunkId} LLM completed in ${elapsed}ms`);

      // Store result
      const candidates = (response as SlideCandidateResponse).slides;
      const result = {
        candidates,
        processingTimeMs: elapsed,
      };

      await ctx.runMutation(internal.studio.jobMutations.slides.storeSlideDeckMapResult, {
        slideDeckId,
        chunkIndex,
        result: JSON.stringify(result),
      });

      logger.info(`Map chunk completed`, {
        chunkIndex,
        elapsed,
        candidatesGenerated: candidates.length,
      });

      // Check if all maps are complete
      const updatedSlideDeck = await ctx.runQuery(internal.studio.slides.index.getInternal, { id: slideDeckId });
      if (!updatedSlideDeck) return;

      const completedMaps = updatedSlideDeck.metadata?.mapResults
        ? Object.keys(updatedSlideDeck.metadata.mapResults).length
        : 0;
      const totalMaps = updatedSlideDeck.metadata?.totalMapTasks || totalChunks;

      console.log(`[SlideDeckJob] Map progress: ${completedMaps}/${totalMaps}`);

      if (completedMaps >= totalMaps) {
        console.log(`[SlideDeckJob] All map tasks complete, scheduling finalization`);
        await ctx.scheduler.runAfter(0, internal.studio.slides.job.finalizeSlideDeckPhase, {
          slideDeckId,
          userId,
          notebookId,
          slideCount,
          deckLength,
        });
      }

    } catch (error) {
      const errorMeta = createErrorMetadata(error, 'map_processing');

      console.error(`[SlideDeckJob] ${chunkId} FAILED:`, errorMeta.message);

      // Store error result
      await ctx.runMutation(internal.studio.jobMutations.slides.storeSlideDeckMapResult, {
        slideDeckId,
        chunkIndex,
        result: JSON.stringify({
          _error: true,
          errorMessage: errorMeta.message,
          isTimeout: errorMeta.type === 'llm_timeout',
          candidates: [],
        }),
      });

      logger.warn(`Map chunk failed`, {
        chunkIndex,
        error: errorMeta.message,
        errorType: errorMeta.type,
      });

      // Check if we should still proceed with partial results
      const slideDeck = await ctx.runQuery(internal.studio.slides.index.getInternal, { id: slideDeckId });
      if (!slideDeck) return;

      const completedMaps = slideDeck.metadata?.mapResults
        ? Object.keys(slideDeck.metadata.mapResults).length
        : 0;
      const totalMaps = slideDeck.metadata?.totalMapTasks || totalChunks;
      const failedMaps = slideDeck.metadata?.mapResults
        ? Object.values(slideDeck.metadata.mapResults).filter(
          (r: any) => {
            try {
              const parsed = JSON.parse(r as string);
              return parsed._error;
            } catch {
              return false;
            }
          }
        ).length
        : 0;

      if (completedMaps >= totalMaps) {
        const successCount = totalMaps - failedMaps;
        console.log(`[SlideDeckJob] All tasks done. Success: ${successCount}/${totalMaps}`);

        if (successCount > 0) {
          await ctx.scheduler.runAfter(0, internal.studio.slides.job.finalizeSlideDeckPhase, {
            slideDeckId,
            userId,
            notebookId,
            slideCount,
            deckLength,
          });
        } else {
          await ctx.runMutation(internal.studio.jobMutations.slides.markSlideDeckFailed, {
            slideDeckId,
            error: 'All map tasks failed',
            metadata: {
              phase: 'failed',
              errorPhase: 'map_processing',
              errorType: 'llm_failure',
              failedAt: Date.now(),
            },
          });
        }
      }
    }
}

// ============================================================
// PHASE 3: Finalize (Select + Refine + Generate Images + Save)
// ============================================================

export async function runFinalizeSlideDeckPhase(
  ctx: ActionCtx,
  args: FinalizeSlideDeckPhaseArgs,
): Promise<void> {
    "use node";

    const { slideDeckId, userId, notebookId, slideCount, deckLength } = args;

    const logger = createJobLogger({
      jobType: 'slides',
      jobId: slideDeckId,
      notebookId,
      userId,
    });

    logger.info('Starting finalization phase');

    // Storage upload function
    const uploadStorage = async (buffer: Buffer, fileName: string) => {
      const uint8Array = new Uint8Array(buffer);
      const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
      const storageId = await ctx.storage.store(blob);
      const url = await ctx.storage.getUrl(storageId);
      if (!url) throw new Error('Failed to get storage URL');
      return url;
    };

    try {
      // Get slide deck with map results
      const slideDeck = await ctx.runQuery(internal.studio.slides.index.getInternal, { id: slideDeckId });
      if (!slideDeck) {
        console.log('[SlideDeckJob] Slide deck deleted during finalization');
        return;
      }

      const mapResults = slideDeck.metadata?.mapResults as Record<string, string> || {};

      // Separate successful and failed results
      const allCandidates: SlideCandidate[] = [];
      const failedCount = { count: 0 };

      for (const [idx, resultJson] of Object.entries(mapResults)) {
        try {
          const parsed = JSON.parse(resultJson);
          if (parsed._error) {
            failedCount.count++;
          } else if (parsed.candidates && Array.isArray(parsed.candidates)) {
            allCandidates.push(...parsed.candidates);
          }
        } catch {
          failedCount.count++;
        }
      }

      console.log(`[SlideDeckJob] Finalization: ${allCandidates.length} candidates collected, ${failedCount.count} failed chunks`);

      if (allCandidates.length === 0) {
        throw new Error('No successful candidates generated from any chunk');
      }

      // Get target slide count range
      const length = (deckLength || 'default') as 'short' | 'default';
      const countRange = SLIDE_COUNT_MAP[length];
      const minSlides = countRange.min;
      const maxSlides = countRange.max;
      const targetSlideCount = Math.floor((minSlides + maxSlides) / 2);

      // Update status for selection
      await ctx.runMutation(internal.studio.jobMutations.slides.updateSlideDeckStatus, {
        slideDeckId,
        status: 'generating',
        metadata: {
          phase: 'selecting',
          progress: 70,
          currentStep: 'Selecting best slides...',
        },
      });

      // Stage 1: Heuristic deduplication
      const dedupedSlides = heuristicDedupeSlides(allCandidates);
      console.log(`[SlideDeckJob] Deduped: ${allCandidates.length} → ${dedupedSlides.length} slides`);

      let selectedCandidates: SlideCandidate[];

      // Skip LLM selection if within limit
      if (dedupedSlides.length <= maxSlides) {
        console.log(`[SlideDeckJob] Skipping LLM selection: ${dedupedSlides.length} slides within limit`);
        selectedCandidates = dedupedSlides;
      } else {
        // Pre-select for LLM (max 30)
        const preSelectedSlides = dedupedSlides.slice(0, 30);

        // Stage 2: LLM selection using SMART_LLM
        try {
          const selectLLM = createReduceLLM();
          const structuredSelectLLM = createSelectionLLM(selectLLM);

          const selectionPrompt = getSlideSelectionPrompt({
            candidates: preSelectedSlides,
            minSlides,
            maxSlides,
            slideType: 'detailed_deck',
            deckLength: length,
          });

          console.log(`[SlideDeckJob] Selection prompt: ${selectionPrompt.length} chars`);

          const startTime = Date.now();
          const selectionResponse = await invokeStudioLlm({
            invoke: () =>
              (structuredSelectLLM as any).invoke(
                [new SystemMessage(SLIDE_SELECTION_SYSTEM_PROMPT), new HumanMessage(selectionPrompt)],
                createLangSmithRunConfig({
                  runName: 'SlideDeckJob.Select',
                  tags: ['agent', 'slides', 'select'],
                  metadata: {
                    targetSlideCount,
                    inputCandidates: preSelectedSlides.length,
                  },
                })
              ),
            timeoutMs: CONFIG.REDUCE_TIMEOUT_MS,
            phaseLabel: 'SlideSelection',
            retry: { maxAttempts: 2, baseDelayMs: 1000 },
          });

          const selection = selectionResponse as SlideSelectionResponse;
          selectedCandidates = selection.slides;
          console.log(`[SlideDeckJob] LLM selection completed in ${Date.now() - startTime}ms, selected ${selectedCandidates.length} slides`);
        } catch (error) {
          console.log(`[SlideDeckJob] LLM selection failed, using heuristic fallback: ${error}`);
          selectedCandidates = selectSlidesHeuristic(preSelectedSlides, targetSlideCount, minSlides, maxSlides);
        }
      }

      // Update status for refinement
      await ctx.runMutation(internal.studio.jobMutations.slides.updateSlideDeckStatus, {
        slideDeckId,
        status: 'generating',
        metadata: {
          phase: 'refining',
          progress: 80,
          currentStep: 'Refining slide prompts...',
        },
      });

      // Stage 3: Refine slides with image generation prompts
      const refineLLM = createRefineLLM();
      const structuredRefineLLM = createSlideLLM(refineLLM);

      console.log(`[SlideDeckJob] Refining ${selectedCandidates.length} slides with concurrency ${CONFIG.REFINE_CONCURRENCY}`);

      const refinedResults = await allWithConcurrency(
        selectedCandidates.slice(0, maxSlides).map((candidate, index) => {
          return async () => {
            try {
              const refinePrompt = getRefineSlidePrompt(candidate, index + 1, 'detailed_deck');

              const refinedSlideRaw = await invokeStudioLlm({
                invoke: () =>
                  (structuredRefineLLM as any).invoke(
                    [new SystemMessage(REFINE_SLIDES_SYSTEM_PROMPT), new HumanMessage(refinePrompt)],
                    createLangSmithRunConfig({
                      runName: 'SlideDeckJob.Refine',
                      tags: ['agent', 'slides', 'refine'],
                      metadata: {
                        slideNumber: index + 1,
                        slideTitle: candidate.title,
                      },
                    })
                  ),
                timeoutMs: CONFIG.REFINE_TIMEOUT_MS,
                phaseLabel: 'SlideRefine',
                retry: { maxAttempts: 2, baseDelayMs: 1000 },
              });

              const refinedSlide = refinedSlideRaw as Slide;
              // Fix slide number
              refinedSlide.slideNumber = index + 1;

              console.log(`[SlideDeckJob] Refined slide ${index + 1}: ${refinedSlide.title}`);
              return refinedSlide;
            } catch (error) {
              console.log(`[SlideDeckJob] Failed to refine slide ${index + 1}: ${error}`);
              return null;
            }
          };
        }),
        CONFIG.REFINE_CONCURRENCY
      );

      const slidesWithPrompts = refinedResults.filter((s): s is Slide => s !== null);
      console.log(`[SlideDeckJob] Refined ${slidesWithPrompts.length} slides (${refinedResults.length - slidesWithPrompts.length} failed)`);

      if (slidesWithPrompts.length === 0) {
        throw new Error('All slide refinements failed');
      }

      // Update status for image generation
      await ctx.runMutation(internal.studio.jobMutations.slides.updateSlideDeckStatus, {
        slideDeckId,
        status: 'generating',
        metadata: {
          phase: 'generating_images',
          progress: 85,
          currentStep: 'Generating slide images...',
        },
      });

      // Stage 4: Generate images via OpenAI (sequential with delay for rate limiting)
      const openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const finalSlides: Slide[] = [];

      for (let i = 0; i < slidesWithPrompts.length; i++) {
        const slide = slidesWithPrompts[i];

        // Add delay between requests (except first)
        if (i > 0) {
          console.log(`[SlideDeckJob] Waiting ${CONFIG.IMAGE_DELAY_MS}ms before generating slide ${slide.slideNumber}...`);
          await new Promise(resolve => setTimeout(resolve, CONFIG.IMAGE_DELAY_MS));
        }

        try {
          // Generate image
          const imageBuffer = await generateSlideImage(openaiClient, slide.prompt, slide.slideNumber);

          // Upload to storage
          const fileName = `slide-${slideDeckId}-${slide.slideNumber}.png`;
          const imageUrl = await uploadStorage(imageBuffer, fileName);

          finalSlides.push({
            ...slide,
            imageUrl,
          });

          console.log(`[SlideDeckJob] Slide ${slide.slideNumber} complete: ${imageUrl}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[SlideDeckJob] CRITICAL: Failed to generate image for slide ${slide.slideNumber}: ${errorMsg}`);
          throw new Error(`Failed to generate image for slide ${slide.slideNumber} ("${slide.title}"): ${errorMsg}`, {
            cause: error,
          });
        }
      }

      // Update status for finalizing
      await ctx.runMutation(internal.studio.jobMutations.slides.updateSlideDeckStatus, {
        slideDeckId,
        status: 'generating',
        metadata: {
          phase: 'finalizing',
          progress: 95,
          currentStep: 'Saving results...',
        },
      });

      // Generate title
      let title = 'Slide Deck';
      try {
        const titleContent = finalSlides.map(s => s.title).join(' ').substring(0, 2000);
        title = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
          chunk: titleContent,
        });
      } catch (e) {
        console.log('[SlideDeckJob] Title generation failed, using default');
      }

      // Save results
      await ctx.runMutation(internal.studio.jobMutations.slides.saveSlideDeckResults, {
        slideDeckId,
        slides: finalSlides,
        metadata: {
          title,
          slideCount: finalSlides.length,
          phase: 'completed',
          progress: 100,
          completedAt: Date.now(),
          mapSuccessCount: Object.keys(mapResults).length - failedCount.count,
          mapFailedCount: failedCount.count,
        },
      });

      // Clear intermediate data
      await ctx.runMutation(internal.studio.jobMutations.slides.clearSlideDeckMapData, { slideDeckId });

      logger.jobComplete({
        slidesGenerated: finalSlides.length,
        title,
        mapSuccess: Object.keys(mapResults).length - failedCount.count,
        mapFailed: failedCount.count,
      });

    } catch (error) {
      const errorMeta = createErrorMetadata(error, 'finalization');

      logger.jobError(error, {
        phase: 'finalization',
        errorType: errorMeta.type,
        retryable: errorMeta.retryable,
      });

      await ctx.runMutation(internal.studio.jobMutations.slides.markSlideDeckFailed, {
        slideDeckId,
        error: errorMeta.message,
        metadata: {
          phase: 'failed',
          errorPhase: 'finalization',
          errorType: errorMeta.type,
          retryable: errorMeta.retryable,
          failedAt: Date.now(),
        },
      });

      throw error;
    }
}

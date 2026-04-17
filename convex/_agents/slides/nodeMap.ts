"use node"

import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import {
  createLangSmithRunConfig,
  invokeWithRetry,
  invokeWithTimeout,
  sanitizeUserInput,
} from '../_shared/index.js';
import { createAgentGraphLogger } from '../_shared/logging.js';

import { GRAPH_CONFIG } from './config.js';
import {
  getCandidateMapPrompt,
  MAP_CONCEPTS_SYSTEM_PROMPT,
  type SlideCandidateResponse,
} from './prompts.js';
import type { ChunkProcessState, OverallStateType } from './state.js';
import type { StructuredOutputInvoker } from './structuredLlm.js';

export interface MapProcessDeps {
  estimateTokens: (text: string) => number;
  structured: StructuredOutputInvoker<SlideCandidateResponse>;
}

export async function mapProcess(
  state: ChunkProcessState,
  deps: MapProcessDeps
): Promise<Partial<OverallStateType>> {
  const { chunk, chunkIndex, slideType, deckLength, customPrompt, slidesPerChunk } = state;
  const startTime = Date.now();

  const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : '[Chunk ?]';

  const logger = createAgentGraphLogger('SlideDeckGraph', 'slides');

  logger.phaseStart('map_process', {
    agent: 'SlideDeckGraph',
    chunkIndex,
    chunkTokens: deps.estimateTokens(chunk),
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

  logger.info(`Sending prompt to LLM (~${deps.estimateTokens(prompt)} tokens)...`, {
    agent: 'SlideDeckGraph',
    phase: 'map_process',
    chunkId,
    promptTokens: deps.estimateTokens(prompt),
  });

  let output: string;
  let slidesGenerated: number;
  let extractedTheme: string | undefined = undefined;

  try {
    const response: SlideCandidateResponse = await invokeWithRetry(
      () =>
        invokeWithTimeout(
          () =>
            (deps.structured as any).invoke(
              [new SystemMessage(MAP_CONCEPTS_SYSTEM_PROMPT), new HumanMessage(prompt)],
              createLangSmithRunConfig({
                runName: 'SlideDeckGraph.MapConcepts',
                tags: ['agent', 'slides', 'map', 'fast-llm'],
                metadata: {
                  chunkIndex,
                  slideType,
                  deckLength,
                  slidesPerChunk,
                },
              })
            ),
          GRAPH_CONFIG.MAP_TIMEOUT_MS,
          'SlideMap'
        ),
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          logger.warn(`Retry attempt ${attempt}/3`, {
            agent: 'SlideDeckGraph',
            phase: 'map_process',
            chunkIndex,
            attempt,
            error: error.message,
          });
        },
      },
      'SlideMap'
    );

    slidesGenerated = response.slides.length;
    output = JSON.stringify(response.slides);

    if (chunkIndex === 0 && response.slides.length > 0) {
      const firstSlide = response.slides[0] as any;
      if (firstSlide.themeSpecification) {
        extractedTheme = firstSlide.themeSpecification;
        logger.info(`Extracted AI-selected theme: ${extractedTheme?.substring(0, 100)}...`, {
          agent: 'SlideDeckGraph',
          phase: 'map_process',
          themeExtracted: true,
        });
      }
    }
  } catch (error) {
    logger.phaseError(
      'map_process',
      error instanceof Error ? error : new Error(String(error)),
      {
        agent: 'SlideDeckGraph',
        chunkIndex,
        chunkLength: chunk.length,
        slideType,
      }
    );

    output = '[]';
    slidesGenerated = 0;
  }

  const elapsed = Date.now() - startTime;

  logger.phaseComplete('map_process', {
    agent: 'SlideDeckGraph',
    chunkIndex,
    outputTokens: deps.estimateTokens(output),
    slidesGenerated,
    processingTimeMs: elapsed,
  });

  return {
    mapOutputs: [output],
    ...(extractedTheme && { themeSpecification: extractedTheme }),
    progress: {
      phase: 'map_process',
      percentage: Math.min(10 + ((chunkIndex ?? 0) * 30), 60),
      message: `Chunk ${(chunkIndex ?? 0) + 1} complete: ${slidesGenerated} slide concepts`,
      chunksCompleted: (chunkIndex ?? 0) + 1,
    },
  };
}

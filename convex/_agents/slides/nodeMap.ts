"use node"

import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import {
  createLangSmithRunConfig,
  invokeWithRetry,
  invokeWithTimeout,
  logError,
  logInfo,
  logPhaseComplete,
  logPhaseStart,
  logWarn,
  sanitizeUserInput,
} from '../_shared/index.js';

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

  logPhaseStart({
    agent: 'SlideDeckGraph',
    phase: 'map_process',
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

  logInfo(
    {
      agent: 'SlideDeckGraph',
      phase: 'map_process',
      chunkId,
      promptTokens: deps.estimateTokens(prompt),
    },
    `Sending prompt to LLM (~${deps.estimateTokens(prompt)} tokens)...`
  );

  let output: string;
  let slidesGenerated = 0;
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
          logWarn(
            {
              agent: 'SlideDeckGraph',
              phase: 'map_process',
              chunkIndex,
              attempt,
              error: error.message,
            },
            `Retry attempt ${attempt}/3`
          );
        },
      },
      'SlideMap'
    );

    slidesGenerated = response.slides.length;
    output = JSON.stringify(response.slides);

    // Extract theme specification from first slide concept (if present)
    if (chunkIndex === 0 && response.slides.length > 0) {
      const firstSlide = response.slides[0] as any;
      if (firstSlide.themeSpecification) {
        extractedTheme = firstSlide.themeSpecification;
        logInfo(
          {
            agent: 'SlideDeckGraph',
            phase: 'map_process',
            themeExtracted: true,
          },
          `Extracted AI-selected theme: ${extractedTheme?.substring(0, 100)}...`
        );
      }
    }
  } catch (error) {
    const errorContext = {
      agent: 'SlideDeckGraph',
      phase: 'map_process',
      chunkIndex,
      chunkLength: chunk.length,
      slideType,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack?.split('\n').slice(0, 3).join('\n'),
            }
          : String(error),
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

"use node"

import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import {
  createLangSmithRunConfig,
  invokeWithRetry,
  invokeWithTimeout,
  sanitizeUserInput,
} from '../_shared/index.js';
import { createAgentGraphLogger } from '../_shared/logging.js';

import { FLASHCARD_CONFIG } from './config.js';
import { MAP_SYSTEM_PROMPT, getMapPrompt, type FlashcardResponse } from './prompts.js';
import type { ChunkProcessState, Flashcard, OverallStateType } from './state.js';
import type { FlashcardOutputInvoker } from './structuredLlm.js';
import { cleanBackText, cleanFrontText } from './textCleanup.js';

export async function mapProcess(
  state: ChunkProcessState,
  structuredLlm: FlashcardOutputInvoker
): Promise<Partial<OverallStateType>> {
  const { chunk, chunkIndex, cardCount, difficulty, topic, cardsPerChunk } = state;
  const startTime = Date.now();

  const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : '[Chunk ?]';

  const logger = createAgentGraphLogger('FlashcardGraph', 'flashcard');

  logger.phaseStart('map_process', {
    agent: 'FlashcardGraph',
    chunkIndex,
    chunkLength: chunk.length,
    chunkPreview: chunk.substring(0, 150).replace(/\n/g, ' '),
    targetCardCount: cardCount,
    cardsPerChunkTarget: cardsPerChunk,
    difficulty,
    topic: topic || 'none',
  });

  const sanitizedTopic = topic ? sanitizeUserInput(topic) : undefined;
  const prompt = getMapPrompt({ chunk, cardCount, cardsPerChunk, difficulty, topic: sanitizedTopic });

  logger.info(`Sending prompt to LLM (${prompt.length} chars)...`, {
    agent: 'FlashcardGraph',
    phase: 'map_process',
    chunkId,
    promptLength: prompt.length,
  });

  try {
    const response = await invokeWithRetry(
      () => invokeWithTimeout(
        () => structuredLlm.invoke([
          new SystemMessage(MAP_SYSTEM_PROMPT),
          new HumanMessage(prompt),
        ], createLangSmithRunConfig({
          runName: 'FlashcardGraph.MapProcess',
          tags: ['agent', 'flashcard', 'map'],
          metadata: {
            chunkIndex,
            cardCount,
            difficulty,
            topic: topic || 'none',
          },
        }) as unknown as Record<string, unknown>),
        FLASHCARD_CONFIG.MAP_TIMEOUT_MS,
        'FlashcardMap'
      ),
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          logger.warn(`Retry attempt ${attempt}/3`, {
            agent: 'FlashcardGraph',
            phase: 'map_process',
            chunkIndex,
            attempt,
            error: error.message,
          });
        },
      },
      'FlashcardMap'
    );

    const flashcards = (response as FlashcardResponse).flashcards;
    const cleanedFlashcards = flashcards.map((card: Flashcard) => ({
      type: card.type,
      front: cleanFrontText(card.front),
      back: cleanBackText(card.back),
      topic: card.topic,
    }));

    const flashcardCount = cleanedFlashcards.length;
    const elapsed = Date.now() - startTime;

    logger.phaseComplete('map_process', {
      agent: 'FlashcardGraph',
      chunkIndex,
      questionsGenerated: flashcardCount,
      processingTimeMs: elapsed,
    });

    return {
      mapOutputs: [cleanedFlashcards],
    };
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('[FlashcardGraph] RAW ERROR DETAILS - Map Process Failed');
    console.error('='.repeat(80));
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'map_process',
      chunkIndex,
      chunkLength: chunk.length,
      errorType: typeof error,
      errorName: error instanceof Error ? error.name : 'N/A',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : 'N/A',
      fullError: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : String(error),
    }, null, 2));
    console.error('='.repeat(80) + '\n');

    const errorToLog = error instanceof Error ? error : new Error(String(error));
    logger.phaseError('map_process', errorToLog, {
      agent: 'FlashcardGraph',
      chunkIndex,
      chunkLength: chunk.length,
      difficulty,
    });

    const elapsed = Date.now() - startTime;
    logger.phaseComplete('map_process', {
      agent: 'FlashcardGraph',
      chunkIndex,
      questionsGenerated: 0,
      processingTimeMs: elapsed,
    });

    return {
      mapOutputs: [[]],
    };
  }
}

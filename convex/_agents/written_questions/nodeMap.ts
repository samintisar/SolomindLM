"use node"

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { randomUUID } from 'crypto';

import {
  createLangSmithRunConfig,
  invokeWithRetry,
  invokeWithTimeout,
  sanitizeUserInput,
} from '../_shared/index.js';
import { createAgentGraphLogger } from '../_shared/logging.js';

import { GRAPH_CONFIG } from './config.js';
import {
  getMapPrompt,
  MAP_SYSTEM_PROMPT,
  type WrittenQuestionsResponse,
} from './prompts.js';
import { validateSelfContained } from './questionHeuristics.js';
import type { ChunkProcessState, OverallStateType, WrittenQuestion } from './state.js';
import type { WrittenQuestionsOutputInvoker } from './structuredLlm.js';

export async function mapProcess(
  state: ChunkProcessState,
  fastLlmStructured: WrittenQuestionsOutputInvoker
): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger('WrittenQuestionsGraph', 'written_questions');
  const { chunk, chunkIndex, questionCount, difficulty, questionType, focus, questionsPerChunk, retryCount = 0 } = state;
  const startTime = Date.now();

  if (retryCount > 0) {
    const backoff = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
    const jitter = Math.random() * backoff * 0.1;
    await new Promise(r => setTimeout(r, backoff + jitter));

    logger.info(`Retry attempt ${retryCount}/2`, {
      agent: 'WrittenQuestionsGraph',
      phase: 'map_process_retry',
      chunkIndex,
      retryCount,
      backoffMs: backoff + jitter,
    });
  }

  const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : '[Chunk ?]';

  logger.phaseStart('map_process', {
    agent: 'WrittenQuestionsGraph',
    chunkIndex,
    retryCount,
    chunkLength: chunk.length,
    chunkPreview: chunk.substring(0, 150).replace(/\n/g, ' '),
    targetQuestionCount: questionCount,
    questionsPerChunkTarget: questionsPerChunk,
    difficulty,
    questionType,
    focus: focus || 'none',
  });

  const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;
  const prompt = getMapPrompt({ chunk, questionCount, questionsPerChunk, difficulty, questionType, focus: sanitizedFocus });

  logger.info(`Sending prompt to LLM (${prompt.length} chars)...`, {
    agent: 'WrittenQuestionsGraph',
    phase: 'map_process',
    chunkId,
    promptLength: prompt.length,
  });

  let output: string;
  let questionsGenerated: number;

  try {
    const response: WrittenQuestionsResponse = await invokeWithRetry(
      () => invokeWithTimeout(
        () => (fastLlmStructured as any).invoke([
          new SystemMessage(MAP_SYSTEM_PROMPT),
          new HumanMessage(prompt),
        ], createLangSmithRunConfig({
          runName: 'WrittenQuestionsGraph.MapProcess',
          tags: ['agent', 'written-questions', 'map'],
          metadata: {
            chunkIndex,
            questionCount,
            difficulty,
            questionType,
            focus: focus || 'none',
          },
        })),
        GRAPH_CONFIG.MAP_TIMEOUT_MS,
        'WrittenQuestionsMap'
      ),
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          logger.warn(`Inner retry attempt ${attempt}/3`, {
            agent: 'WrittenQuestionsGraph',
            phase: 'map_process',
            chunkIndex,
            attempt,
            error: error.message,
          });
        },
      },
      'WrittenQuestionsMap'
    );

    let validQuestions = response.questions.filter(q => validateSelfContained(q));

    const expectedPoints = questionType === 'short' ? 5 : 12;
    validQuestions = validQuestions.map(q => ({
      ...q,
      id: randomUUID(),
      questionType: questionType as 'short' | 'essay',
      rubric: {
        ...q.rubric,
        maxPoints: expectedPoints,
      },
    }));

    logger.info(`Validated ${validQuestions.length}/${response.questions.length} questions`, {
      agent: 'WrittenQuestionsGraph',
      phase: 'map_process_validation',
      chunkIndex,
      generatedCount: response.questions.length,
      validatedCount: validQuestions.length,
      rejectedCount: response.questions.length - validQuestions.length,
    });

    questionsGenerated = validQuestions.length;
    output = JSON.stringify(validQuestions);

  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('[WrittenQuestionsGraph] ===== MAP PROCESS ERROR =====');
    console.error('='.repeat(80));
    console.error(`Chunk Index: ${chunkIndex}`);
    console.error(`Chunk Length: ${chunk.length} chars`);
    console.error(`Prompt Length: ${prompt.length} chars`);
    console.error(`Difficulty: ${difficulty}`);
    console.error(`Question Type: ${questionType}`);

    if (error instanceof Error) {
      console.error(`Error Name: ${error.name}`);
      console.error(`Error Message: ${error.message}`);
      console.error(`Error Stack:\n${error.stack}`);
      console.error(`Error Cause:`, error.cause);
    } else {
      console.error('Error (non-Error):', String(error));
      console.error('Error details:', error);
    }

    console.error('='.repeat(80));

    const errorContext = {
      agent: 'WrittenQuestionsGraph',
      phase: 'map_process',
      chunkIndex,
      chunkLength: chunk.length,
      difficulty,
      questionType,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        cause: error.cause,
      } : String(error),
    };

    logger.phaseError(
      'map_process',
      error instanceof Error ? error : new Error(String(error)),
      errorContext
    );
    throw error;
  }

  const elapsed = Date.now() - startTime;
  const previewQuestions = questionsGenerated > 0 ? JSON.parse(output) as WrittenQuestion[] : [];

  logger.phaseComplete('map_process', {
    agent: 'WrittenQuestionsGraph',
    chunkIndex,
    outputLength: output.length,
    questionsGenerated,
    processingTimeMs: elapsed,
    outputPreview: previewQuestions.map((q: WrittenQuestion) => q.question.substring(0, 50)).join('; '),
  });

  return {
    mapOutputs: [output],
    progress: {
      phase: 'map_process',
      percentage: Math.min(10 + ((chunkIndex ?? 0) * 30), 60),
      message: `Chunk ${(chunkIndex ?? 0) + 1} complete: ${questionsGenerated} questions`,
      chunksCompleted: (chunkIndex ?? 0) + 1,
    },
  };
}

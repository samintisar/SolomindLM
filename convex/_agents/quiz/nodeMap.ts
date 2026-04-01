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
  MAP_CANDIDATES_SYSTEM_PROMPT,
  type QuizCandidate,
  type QuizCandidateResponse,
} from './prompts.js';
import type { ChunkProcessState, OverallStateType } from './state.js';
import type { StructuredOutputInvoker } from './structuredLlm.js';

export interface MapProcessDeps {
  fastLlmCandidateStructured: StructuredOutputInvoker<QuizCandidateResponse>;
  estimateTokens: (text: string) => number;
}

export async function mapProcess(
  state: ChunkProcessState,
  deps: MapProcessDeps
): Promise<Partial<OverallStateType>> {
  const { chunk, chunkIndex, questionCount, difficulty, focus, questionsPerChunk } = state;
  const startTime = Date.now();

  const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : '[Chunk ?]';

  logPhaseStart({
    agent: 'QuizGraph',
    phase: 'map_process',
    chunkIndex,
    chunkTokens: deps.estimateTokens(chunk),
    chunkPreview: chunk.substring(0, 150).replace(/\n/g, ' '),
    targetQuestionCount: questionCount,
    questionsPerChunkTarget: questionsPerChunk,
    difficulty,
    focus: focus || 'none',
  });

  const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;
  const prompt = getCandidateMapPrompt({ chunk, questionCount, questionsPerChunk, difficulty, focus: sanitizedFocus });

  logInfo({
    agent: 'QuizGraph',
    phase: 'map_process',
    chunkId,
    promptTokens: deps.estimateTokens(prompt),
  }, `Sending prompt to LLM (~${deps.estimateTokens(prompt)} tokens)...`);

  let output: string;
  let candidatesGenerated = 0;

  try {
    const response: QuizCandidateResponse = await invokeWithRetry(
      () => invokeWithTimeout(
        () => (deps.fastLlmCandidateStructured as any).invoke([
          new SystemMessage(MAP_CANDIDATES_SYSTEM_PROMPT),
          new HumanMessage(prompt),
        ], createLangSmithRunConfig({
          runName: 'QuizGraph.MapCandidates',
          tags: ['agent', 'quiz', 'map'],
          metadata: {
            chunkIndex,
            questionCount,
            difficulty,
            focus: focus || 'none',
          },
        })),
        GRAPH_CONFIG.MAP_TIMEOUT_MS,
        'QuizMap'
      ),
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          logWarn({
            agent: 'QuizGraph',
            phase: 'map_process',
            chunkIndex,
            attempt,
            error: error.message,
          }, `Retry attempt ${attempt}/3`);
        }
      },
      'QuizMap'
    );

    candidatesGenerated = response.questions.length;
    output = JSON.stringify(response.questions);
  } catch (error) {
    const errorContext = {
      agent: 'QuizGraph',
      phase: 'map_process',
      chunkIndex,
      chunkLength: chunk.length,
      difficulty,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      } : String(error),
    };

    logError(errorContext, 'Map process failed');

    output = '[]';
    candidatesGenerated = 0;
  }

  const elapsed = Date.now() - startTime;

  logPhaseComplete({
    agent: 'QuizGraph',
    phase: 'map_process',
    chunkIndex,
    outputTokens: deps.estimateTokens(output),
    questionsGenerated: candidatesGenerated,
    processingTimeMs: elapsed,
    outputPreview: output.substring(0, 200).replace(/\n/g, ' '),
  });

  return {
    mapOutputs: [output],
    progress: {
      phase: 'map_process',
      percentage: Math.min(10 + ((chunkIndex ?? 0) * 30), 60),
      message: `Chunk ${(chunkIndex ?? 0) + 1} complete: ${candidatesGenerated} candidates`,
      chunksCompleted: (chunkIndex ?? 0) + 1,
    },
  };
}

"use node"

import { randomUUID } from 'crypto';

import { clearStateKeys } from '../_shared/index.js';
import { createAgentGraphLogger } from '../_shared/logging.js';

import { GRAPH_CONFIG } from './config.js';
import type { WrittenQuestion } from './prompts.js';
import { callStatusUpdate } from './nodeSplit.js';
import type { OverallStateType } from './state.js';

export async function collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger('WrittenQuestionsGraph', 'written_questions');
  console.log(`\n${'='.repeat(80)}`);
  console.log('[WrittenQuestionsGraph] ===== COLLAPSE PHASE =====');
  console.log('='.repeat(80));

  if (!state.mapOutputs || state.mapOutputs.length === 0) {
    logger.phaseError('collapse', new Error('No mapOutputs received'), {
      agent: 'WrittenQuestionsGraph',
    });
    await callStatusUpdate(state, 'collapsing');
    return {
      ...state,
      collapsedOutputs: [],
      status: 'reducing',
    };
  }

  const totalChunksReceived = state.mapOutputs.length;

  await callStatusUpdate(state, 'collapsing');

  const allQuestions: WrittenQuestion[] = [];
  const failures: Array<{ output: string; error: string }> = [];
  const emptyChunks: number[] = [];

  for (let i = 0; i < state.mapOutputs.length; i++) {
    const jsonStr = state.mapOutputs[i];
    try {
      let questions = JSON.parse(jsonStr) as WrittenQuestion[];

      const expectedPoints = state.questionType === 'short' ? 5 : 12;
      questions = questions.map(q => ({
        ...q,
        id: (q.id && q.id.trim()) ? q.id : randomUUID(),
        questionType: state.questionType as 'short' | 'essay',
        rubric: {
          ...q.rubric,
          maxPoints: expectedPoints,
        },
      }));

      if (questions.length === 0) {
        emptyChunks.push(i);
      }
      allQuestions.push(...questions);
    } catch (e) {
      const preview = jsonStr.substring(0, 100);
      failures.push({
        output: preview,
        error: e instanceof Error ? e.message : String(e),
      });
      logger.warn('Failed to parse map output JSON, skipping', {
        agent: 'WrittenQuestionsGraph',
        phase: 'collapse_parse_error',
        chunkIndex: i,
        outputPreview: preview,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const successfulChunks = totalChunksReceived - failures.length - emptyChunks.length;
  const chunkCoverage = successfulChunks / totalChunksReceived;

  logger.info(`Chunk coverage: ${successfulChunks}/${totalChunksReceived} (${(chunkCoverage * 100).toFixed(1)}%)`, {
    agent: 'WrittenQuestionsGraph',
    phase: 'collapse_coverage',
    totalChunks: totalChunksReceived,
    successfulChunks,
    failedChunks: failures.length,
    emptyChunks: emptyChunks.length,
    chunkCoverage: `${(chunkCoverage * 100).toFixed(1)}%`,
  });

  if (chunkCoverage < GRAPH_CONFIG.CHUNK_COVERAGE_THRESHOLD) {
    logger.warn(`WARNING: Low chunk coverage (${(chunkCoverage * 100).toFixed(1)}% < ${GRAPH_CONFIG.CHUNK_COVERAGE_THRESHOLD * 100}%)`, {
      agent: 'WrittenQuestionsGraph',
      phase: 'collapse_low_coverage',
      chunkCoverage,
      threshold: GRAPH_CONFIG.CHUNK_COVERAGE_THRESHOLD,
    });
  }

  if (allQuestions.length === 0 && state.mapOutputs.length > 0) {
    logger.phaseError('collapse_critical', new Error('CRITICAL: All map outputs failed to parse or returned empty'), {
      agent: 'WrittenQuestionsGraph',
      failures: failures.length,
      emptyChunks: emptyChunks.length,
      failureExamples: failures.slice(0, 3).map(f => f.output),
    });

    return {
      ...state,
      collapsedOutputs: [],
      status: 'failed',
    };
  }

  if (failures.length > 0) {
    logger.warn(`${failures.length}/${state.mapOutputs.length} map outputs failed to parse`, {
      agent: 'WrittenQuestionsGraph',
      phase: 'collapse_partial_failure',
      successCount: allQuestions.length,
      failureCount: failures.length,
    });
  }

  logger.info(`Concatenated ${successfulChunks} successful chunks into ${allQuestions.length} questions`, {
    agent: 'WrittenQuestionsGraph',
    phase: 'collapse_concatenate',
    totalQuestions: allQuestions.length,
    successfulChunks,
  });

  const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
  logger.info(`Freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`, {
    agent: 'WrittenQuestionsGraph',
    phase: 'collapse_cleanup',
    memoryFreedKB: (mapOutputsSize / 1024).toFixed(2),
  });

  return {
    ...state,
    collapsedOutputs: [JSON.stringify(allQuestions)],
    status: 'reducing',
    ...clearStateKeys<OverallStateType>(['mapOutputs']),
    progress: {
      phase: 'collapse',
      percentage: 70,
      message: `Collected ${allQuestions.length} questions from all chunks`,
      itemsGenerated: allQuestions.length,
    },
  };
}

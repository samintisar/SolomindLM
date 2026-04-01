"use node"

import { randomUUID } from 'crypto';

import { clearStateKeys, logError, logInfo, logWarn } from '../_shared/index.js';

import { GRAPH_CONFIG } from './config.js';
import type { WrittenQuestion } from './prompts.js';
import { callStatusUpdate } from './nodeSplit.js';
import type { OverallStateType } from './state.js';

export async function collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
  console.log(`\n${'='.repeat(80)}`);
  console.log('[WrittenQuestionsGraph] ===== COLLAPSE PHASE =====');
  console.log('='.repeat(80));

  if (!state.mapOutputs || state.mapOutputs.length === 0) {
    logError({
      agent: 'WrittenQuestionsGraph',
      phase: 'collapse',
      error: 'No mapOutputs received',
    }, 'Collapse: ERROR - No mapOutputs received!');
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
      logWarn({
        agent: 'WrittenQuestionsGraph',
        phase: 'collapse_parse_error',
        chunkIndex: i,
        outputPreview: preview,
        error: e instanceof Error ? e.message : String(e),
      }, 'Failed to parse map output JSON, skipping');
    }
  }

  const successfulChunks = totalChunksReceived - failures.length - emptyChunks.length;
  const chunkCoverage = successfulChunks / totalChunksReceived;

  logInfo({
    agent: 'WrittenQuestionsGraph',
    phase: 'collapse_coverage',
    totalChunks: totalChunksReceived,
    successfulChunks,
    failedChunks: failures.length,
    emptyChunks: emptyChunks.length,
    chunkCoverage: `${(chunkCoverage * 100).toFixed(1)}%`,
  }, `Chunk coverage: ${successfulChunks}/${totalChunksReceived} (${(chunkCoverage * 100).toFixed(1)}%)`);

  if (chunkCoverage < GRAPH_CONFIG.CHUNK_COVERAGE_THRESHOLD) {
    logWarn({
      agent: 'WrittenQuestionsGraph',
      phase: 'collapse_low_coverage',
      chunkCoverage,
      threshold: GRAPH_CONFIG.CHUNK_COVERAGE_THRESHOLD,
    }, `WARNING: Low chunk coverage (${(chunkCoverage * 100).toFixed(1)}% < ${GRAPH_CONFIG.CHUNK_COVERAGE_THRESHOLD * 100}%)`);
  }

  if (allQuestions.length === 0 && state.mapOutputs.length > 0) {
    logError({
      agent: 'WrittenQuestionsGraph',
      phase: 'collapse_critical',
      failures: failures.length,
      emptyChunks: emptyChunks.length,
      failureExamples: failures.slice(0, 3).map(f => f.output),
    }, 'CRITICAL: All map outputs failed to parse or returned empty');

    return {
      ...state,
      collapsedOutputs: [],
      status: 'failed',
    };
  }

  if (failures.length > 0) {
    logWarn({
      agent: 'WrittenQuestionsGraph',
      phase: 'collapse_partial_failure',
      successCount: allQuestions.length,
      failureCount: failures.length,
    }, `${failures.length}/${state.mapOutputs.length} map outputs failed to parse`);
  }

  logInfo({
    agent: 'WrittenQuestionsGraph',
    phase: 'collapse_concatenate',
    totalQuestions: allQuestions.length,
    successfulChunks,
  }, `Concatenated ${successfulChunks} successful chunks into ${allQuestions.length} questions`);

  const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
  logInfo({
    agent: 'WrittenQuestionsGraph',
    phase: 'collapse_cleanup',
    memoryFreedKB: (mapOutputsSize / 1024).toFixed(2),
  }, `Freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`);

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

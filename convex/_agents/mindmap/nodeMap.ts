"use node"

import { Send } from '@langchain/langgraph';

import {
  logError,
  logInfo,
  logWarn,
} from '../_shared/index.js';

import { NODES } from './prompts.js';
import type { ChunkStateType, ConceptExtraction, OverallStateType } from './state.js';

export interface MindMapMapProcessDeps {
  extractConcepts: (content: string) => Promise<ConceptExtraction>;
  onMapSuccess: () => void;
  onPermanentChunkFailure: () => number;
  maxTotalFailures: number;
}

export async function mapProcess(
  state: ChunkStateType,
  deps: MindMapMapProcessDeps
): Promise<Partial<OverallStateType> | Send> {
  const chunkLength = state.content?.length || 0;
  const retryCount = state.retryCount ?? 0;

  logInfo({
    agent: 'MindMapGraph',
    phase: 'map_process',
    chunkLength,
    attempt: retryCount + 1,
  }, `Processing chunk (${chunkLength} chars) [Attempt ${retryCount + 1}/3]`);

  const startTime = Date.now();

  try {
    if (retryCount > 0) {
      const backoff = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
      const jitter = Math.random() * backoff * 0.1;
      await new Promise(r => setTimeout(r, backoff + jitter));

      logInfo({
        agent: 'MindMapGraph',
        phase: 'map_process',
        backoff: Math.round(backoff + jitter),
      }, `Retry backoff: ${Math.round(backoff + jitter)}ms`);
    } else {
      await new Promise(r => setTimeout(r, Math.random() * 500));
    }

    const extraction = await deps.extractConcepts(state.content || '');
    const elapsed = Date.now() - startTime;

    logInfo({
      agent: 'MindMapGraph',
      phase: 'map_process',
      conceptsExtracted: extraction.key_concepts.length,
      processingTimeMs: elapsed,
      mainTheme: extraction.main_theme,
    }, `Extracted ${extraction.key_concepts.length} concepts in ${elapsed}ms`);

    deps.onMapSuccess();

    return {
      extractedConcepts: [extraction],
      progress: {
        phase: 'map_process',
        percentage: Math.min(10 + ((state.chunkIndex ?? 0) * 40), 50),
        message: `Chunk ${(state.chunkIndex ?? 0) + 1}/${state.totalChunks ?? '?'} complete: ${extraction.key_concepts.length} concepts`,
        chunksCompleted: (state.chunkIndex ?? 0) + 1,
        totalChunks: state.totalChunks,
        conceptsExtracted: extraction.key_concepts.length,
      },
    };
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);

    logError({
      agent: 'MindMapGraph',
      phase: 'map_process',
      error: e instanceof Error ? {
        name: e.name,
        message: e.message,
        stack: e.stack?.split('\n').slice(0, 3).join('\n'),
      } : String(e),
      attempts: retryCount + 1,
    }, `Chunk failed: ${msg}`);

    const isTimeout = msg.toLowerCase().includes('timeout');
    const isServerErr = msg.includes('500') || msg.includes('503') || msg.includes('internal server error');

    const MAX_ATTEMPTS = 3;
    if ((isTimeout || isServerErr) && retryCount < MAX_ATTEMPTS - 1) {
      logWarn({
        agent: 'MindMapGraph',
        phase: 'map_process',
        retryAttempt: retryCount + 1,
        maxAttempts: MAX_ATTEMPTS,
      }, `Retrying chunk (${retryCount + 1}/${MAX_ATTEMPTS})...`);
      return new Send(NODES.MAP_PROCESS, {
        content: state.content,
        retryCount: retryCount + 1,
      });
    }

    const totalFailures = deps.onPermanentChunkFailure();
    if (totalFailures >= deps.maxTotalFailures) {
      logError({
        agent: 'MindMapGraph',
        phase: 'map_process',
        totalFailures,
      }, `CIRCUIT BREAKER: ${totalFailures} failures - stopping generation`);

      throw new Error(`Circuit breaker tripped: ${totalFailures} chunks failed permanently`);
    }

    logError({
      agent: 'MindMapGraph',
      phase: 'map_process',
      attempts: retryCount + 1,
      totalFailures,
    }, `Chunk failed permanently (${totalFailures} total failures)`);
    return { extractedConcepts: [] };
  }
}

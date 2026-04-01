"use node"

import type OpenAI from 'openai';

import {
  logInfo,
  logError,
  logPhaseStart,
  logBanner,
} from '../_shared/index.js';
import type { OverallStateType, DialogueLine } from './state.js';
import { GRAPH_CONFIG } from './config.js';
import { VOICES } from './voices.js';

export interface SynthesizeAudioDeps {
  openai: OpenAI;
}

/**
 * Synthesize audio from dialogue script (TTS phase).
 */
export async function synthesizeAudio(
  state: OverallStateType,
  deps: SynthesizeAudioDeps
): Promise<Partial<OverallStateType>> {
  const { dialogueScript } = state;
  const { openai } = deps;

  if (!dialogueScript || dialogueScript.length === 0) {
    throw new Error('No dialogue script to synthesize');
  }

  logPhaseStart({
    agent: 'AudioOverviewGraph',
    phase: 'synthesize_audio',
    dialogueLines: dialogueScript.length,
  });

  const results: { index: number; buffer: Buffer | null }[] = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < dialogueScript.length; i += BATCH_SIZE) {
    const batchLines = dialogueScript.slice(i, i + BATCH_SIZE);

    logInfo({
      agent: 'AudioOverviewGraph',
      phase: 'synthesize_batch',
      batch: Math.floor(i / BATCH_SIZE) + 1,
      batchLines: batchLines.length,
    }, `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}`);

    const batchPromises = batchLines.map(async (line: DialogueLine, batchIdx: number) => {
      const globalIndex = i + batchIdx;
      const voice = (line.speaker === 'host_a' ? VOICES.host_a : VOICES.host_b) as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

      try {
        const mp3 = await Promise.race([
          openai.audio.speech.create({
            model: 'tts-1',
            voice: voice,
            input: line.text,
            response_format: 'mp3',
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('TTS timeout')), GRAPH_CONFIG.TTS_TIMEOUT_MS)
          ),
        ]);

        const buffer = Buffer.from(await mp3.arrayBuffer());

        logInfo({
          agent: 'AudioOverviewGraph',
          phase: 'synthesize_line',
          line: globalIndex + 1,
          total: dialogueScript.length,
          speaker: line.speaker,
          bufferSize: buffer.length,
        });

        return { index: globalIndex, buffer };
      } catch (error) {
        logError({
          agent: 'AudioOverviewGraph',
          phase: 'synthesize_line',
          line: globalIndex + 1,
          error: error instanceof Error ? error.message : String(error),
        }, `Failed line ${globalIndex + 1}`);
        return { index: globalIndex, buffer: null };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  const sortedBuffers = results
    .sort((a, b) => a.index - b.index)
    .map(r => r.buffer)
    .filter((b): b is Buffer => b !== null);

  const successCount = sortedBuffers.length;

  if (successCount < dialogueScript.length * 0.5) {
    logError({
      agent: 'AudioOverviewGraph',
      phase: 'synthesize_audio',
      successCount,
      totalLines: dialogueScript.length,
    }, `Too many synthesis failures: ${successCount}/${dialogueScript.length} lines succeeded`);
    throw new Error(`Too many synthesis failures: ${successCount}/${dialogueScript.length} lines succeeded`);
  }

  const audioBuffer = Buffer.concat(sortedBuffers);

  logBanner(
    {
      agent: 'AudioOverviewGraph',
      phase: 'generation_complete',
      linesSucceeded: successCount,
      totalLines: dialogueScript.length,
      finalAudioSize: audioBuffer.length,
    },
    'AUDIO GENERATION COMPLETE'
  );

  return {
    ...state,
    audioBuffer,
    status: 'completed',
    progress: {
      phase: 'complete',
      percentage: 100,
      message: `Audio generation complete (${successCount} lines)`,
      dialogueLines: successCount,
    },
  };
}

"use node";

import type Together from "together-ai";

import { synthesizeSpeechToBuffer } from "../../_services/ai/togetherTts.js";
import { env } from "../../_lib/env.js";
import { withoutMapOutputs } from "../_shared/index.js";
import { createAgentGraphLogger } from "../_shared/logging.js";
import type { OverallStateType, DialogueLine } from "./state.js";
import { GRAPH_CONFIG } from "./config.js";
import { VOICES } from "./voices.js";

export interface SynthesizeAudioDeps {
  together: Together;
}

/**
 * Synthesize audio from dialogue script (TTS phase).
 */
export async function synthesizeAudio(
  state: OverallStateType,
  deps: SynthesizeAudioDeps
): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger("AudioOverviewGraph", "audio");
  const { dialogueScript } = state;
  const { together } = deps;

  if (!dialogueScript || dialogueScript.length === 0) {
    throw new Error("No dialogue script to synthesize");
  }

  logger.phaseStart("synthesize_audio", {
    agent: "AudioOverviewGraph",
    dialogueLines: dialogueScript.length,
  });

  const results: { index: number; buffer: Buffer | null }[] = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < dialogueScript.length; i += BATCH_SIZE) {
    const batchLines = dialogueScript.slice(i, i + BATCH_SIZE);

    logger.info(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}`, {
      agent: "AudioOverviewGraph",
      phase: "synthesize_batch",
      batch: Math.floor(i / BATCH_SIZE) + 1,
      batchLines: batchLines.length,
    });

    const batchPromises = batchLines.map(async (line: DialogueLine, batchIdx: number) => {
      const globalIndex = i + batchIdx;
      const voice = line.speaker === "host_a" ? VOICES.host_a : VOICES.host_b;

      try {
        const buffer = await synthesizeSpeechToBuffer(together, {
          model: env.AUDIO_TTS_MODEL,
          input: line.text,
          voice,
          timeoutMs: GRAPH_CONFIG.TTS_TIMEOUT_MS,
        });

        logger.info(`Synthesized line ${globalIndex + 1}/${dialogueScript.length}`, {
          agent: "AudioOverviewGraph",
          phase: "synthesize_line",
          line: globalIndex + 1,
          total: dialogueScript.length,
          speaker: line.speaker,
          bufferSize: buffer.length,
        });

        return { index: globalIndex, buffer };
      } catch (error) {
        logger.phaseError(
          "synthesize_line",
          error instanceof Error ? error : new Error(String(error)),
          {
            agent: "AudioOverviewGraph",
            line: globalIndex + 1,
          }
        );
        return { index: globalIndex, buffer: null };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  const sortedBuffers = results
    .sort((a, b) => a.index - b.index)
    .map((r) => r.buffer)
    .filter((b): b is Buffer => b !== null);

  const successCount = sortedBuffers.length;

  if (successCount < dialogueScript.length * 0.5) {
    logger.phaseError(
      "synthesize_audio",
      new Error(
        `Too many synthesis failures: ${successCount}/${dialogueScript.length} lines succeeded`
      ),
      {
        agent: "AudioOverviewGraph",
        successCount,
        totalLines: dialogueScript.length,
      }
    );
    throw new Error(
      `Too many synthesis failures: ${successCount}/${dialogueScript.length} lines succeeded`
    );
  }

  const audioBuffer = Buffer.concat(sortedBuffers);

  logger.info("AUDIO GENERATION COMPLETE", {
    agent: "AudioOverviewGraph",
    phase: "generation_complete",
    linesSucceeded: successCount,
    totalLines: dialogueScript.length,
    finalAudioSize: audioBuffer.length,
    milestone: true,
  });

  return {
    ...withoutMapOutputs(state),
    audioBuffer,
    status: "completed",
    progress: {
      phase: "complete",
      percentage: 100,
      message: `Audio generation complete (${successCount} lines)`,
      dialogueLines: successCount,
    },
  };
}

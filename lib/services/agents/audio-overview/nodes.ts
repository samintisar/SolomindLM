"use node"
/**
 * Node functions for AudioOverviewGraph.
 *
 * Contains all node logic for extract_beats, collapse, write_script,
 * and synthesize_audio phases.
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import OpenAI from 'openai';
import { START, END, Send } from '@langchain/langgraph';

import { env } from '../../../helpers/env';
import {
  invokeWithTimeout,
  invokeWithRetry,
  logInfo,
  logWarn,
  logError,
  logPhaseStart,
  logPhaseComplete,
  logBanner,
  sanitizeUserInput,
  countTokens,
  createLangSmithRunConfig,
} from '../shared/index.js';
import { createChunkHelpers, type ChunkHelpers } from '../shared/chunk-helper-factory.js';
import { OverallState, type OverallStateType, type ChunkProcessState, type DialogueLine } from './state.js';
import type { AudioType, AudioLength } from './prompts.js';
import { getMapPrompt, getReducePrompt, buildCoveredTopicsPrompt, TARGET_LINE_COUNTS, DIALOGUE_CHUNK_SIZE, ESTIMATED_WORDS_PER_LINE, MAP_SYSTEM_PROMPT, REDUCE_SYSTEM_PROMPT, EXAMPLE_EXTRACTION_SYSTEM_PROMPT } from './prompts.js';

// ============================================================
// Constants
// ============================================================

/** Configuration constants */
const GRAPH_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.AUDIO_MAP_CHUNK_TOKENS || '3750', 10), // ~15K chars ≈ 3.75K tokens
  REDUCE_CHUNK_SIZE_TOKENS: parseInt(env.AUDIO_REDUCE_CHUNK_TOKENS || '10000', 10), // ~40K chars ≈ 10K tokens
  MAP_TIMEOUT_MS: parseInt(env.AUDIO_MAP_TIMEOUT_MS || '180000', 10),
  REDUCE_TIMEOUT_MS: parseInt(env.AUDIO_REDUCE_TIMEOUT_MS || '300000', 10),
  TTS_TIMEOUT_MS: parseInt(env.AUDIO_TTS_TIMEOUT_MS || '300000', 10),
} as const;

/** Voice configuration (OpenAI TTS-1) */
const VOICES = {
  host_a: env.AUDIO_VOICE_HOST_A,
  host_b: env.AUDIO_VOICE_HOST_B,
} as const;

// ============================================================
// Chunk Helpers
// ============================================================

/** Chunk helpers using the shared factory */
const { packChunks, validateChunks }: ChunkHelpers = createChunkHelpers('AudioOverviewGraph', {
  targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS,
  minChunkLength: 50,
  maxChunkLength: 50000,
});

// ============================================================
// Recursive Collapse Helper
// ============================================================

/**
 * Recursively collapses multiple outputs into fewer chunks using actual token counting.
 */
async function recursiveCollapse(outputs: string[], maxTokens: number): Promise<string[]> {
  if (outputs.length <= 3) {
    return outputs;
  }

  // Calculate total tokens using actual counting
  const totalTokens = outputs.reduce((sum, s) => sum + countTokens(s), 0);

  // If already under the limit, no need to collapse
  if (totalTokens <= maxTokens) {
    return outputs;
  }

  // Group outputs to stay under token limit
  const collapsed: string[] = [];
  let currentGroup: string[] = [];
  let currentTokens = 0;

  for (const output of outputs) {
    const tokens = countTokens(output);
    if (currentTokens + tokens > maxTokens && currentGroup.length > 0) {
      collapsed.push(currentGroup.join('\n\n---\n\n'));
      currentGroup = [output];
      currentTokens = tokens;
    } else {
      currentGroup.push(output);
      currentTokens += tokens;
    }
  }

  if (currentGroup.length > 0) {
    collapsed.push(currentGroup.join('\n\n---\n\n'));
  }

  logInfo({
    agent: 'AudioOverviewGraph',
    phase: 'recursive_collapse',
    inputCount: outputs.length,
    outputCount: collapsed.length,
    totalTokens,
  }, `Recursive collapse: ${outputs.length} -> ${collapsed.length} (${totalTokens} tokens)`);

  return collapsed;
}

// ============================================================
// Node Functions
// ============================================================

/**
 * Extract dialogue beats from a chunk (map phase).
 */
export async function extractBeats(
  state: ChunkProcessState,
  fastLlm: any
): Promise<Partial<OverallStateType>> {
  const { chunk, audioType, length, focus, chunkIndex, totalChunks } = state;
  const startTime = Date.now();

  logPhaseStart({
    agent: 'AudioOverviewGraph',
    phase: 'extract_beats',
    chunkIndex,
    chunkLength: chunk.length,
    audioType,
    length,
    focus: focus || 'none',
  });

  // Sanitize user input (focus)
  const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;

  const prompt = getMapPrompt(audioType, chunk);

  logInfo({
    agent: 'AudioOverviewGraph',
    phase: 'extract_beats',
    chunkIndex,
    promptLength: prompt.length,
  }, `Sending prompt to LLM (${prompt.length} chars)...`);

  let output: string;
  try {
    // Timeout + Retry wrapper for resilient LLM calls
    const response = await invokeWithRetry(
      () => invokeWithTimeout(
        () => fastLlm.invoke([
          new SystemMessage(MAP_SYSTEM_PROMPT),
          new HumanMessage(prompt),
        ], createLangSmithRunConfig({
          runName: 'AudioOverviewGraph.ExtractBeats',
          tags: ['agent', 'audio-overview', 'map'],
          metadata: {
            chunkIndex,
            chunkLength: chunk.length,
            audioType,
            length,
            focus: focus || 'none',
          },
        })),
        GRAPH_CONFIG.MAP_TIMEOUT_MS,
        'AudioMap'
      ),
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          logWarn({
            agent: 'AudioOverviewGraph',
            phase: 'extract_beats',
            chunkIndex,
            attempt,
            error: error.message,
          }, `Retry attempt ${attempt}/3`);
        }
      },
      'AudioMap'
    );

    output = String((response as { content: { toString: () => string } }).content);
  } catch (error) {
    const errorContext = {
      agent: 'AudioOverviewGraph',
      phase: 'extract_beats',
      chunkIndex,
      chunkLength: chunk.length,
      audioType,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      } : String(error),
    };

    logError(errorContext, 'Extract beats failed');

    output = `• Error processing chunk ${chunkIndex}\n• Unable to extract dialogue beats\n\n[Fallback: Continue with other chunks]`;
  }

  const elapsed = Date.now() - startTime;

  logPhaseComplete({
    agent: 'AudioOverviewGraph',
    phase: 'extract_beats',
    chunkIndex,
    outputLength: output.length,
    processingTimeMs: elapsed,
  });

  return {
    mapOutputs: [output],
    progress: {
      phase: 'extract_beats',
      percentage: Math.min(10 + ((chunkIndex ?? 0) * 20), 40),
      message: `Chunk ${(chunkIndex ?? 0) + 1}/${totalChunks ?? '?'} analyzed`,
      chunksCompleted: (chunkIndex ?? 0) + 1,
      totalChunks: totalChunks,
    },
  };
}

/**
 * Collapse map outputs into fewer chunks (collapse phase).
 */
export async function collapse(
  state: OverallStateType
): Promise<Partial<OverallStateType>> {
  const { mapOutputs } = state;

  logPhaseStart({
    agent: 'AudioOverviewGraph',
    phase: 'collapse',
    inputCount: mapOutputs.length,
  });

  const collapsed = await recursiveCollapse(mapOutputs, GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS / 2);

  logInfo({
    agent: 'AudioOverviewGraph',
    phase: 'collapse',
    outputCount: collapsed.length,
  }, `Collapsed ${mapOutputs.length} outputs to ${collapsed.length}`);

  return {
    ...state,
    collapsedOutputs: collapsed,
    status: 'reducing',
    progress: {
      phase: 'collapse',
      percentage: 50,
      message: `Consolidated ${mapOutputs.length} chunks`,
    },
  };
}

/**
 * Generate dialogue script from collapsed outputs (reduce phase).
 */
export async function writeScript(
  state: OverallStateType,
  smartLlm: any
): Promise<Partial<OverallStateType>> {
  const { collapsedOutputs, audioType, length, focus } = state;
  const startTime = Date.now();

  logPhaseStart({
    agent: 'AudioOverviewGraph',
    phase: 'write_script',
    audioType,
    length,
    collapsedOutputsCount: collapsedOutputs.length,
    focus: focus || 'none',
  });

  // Sanitize user input (focus)
  const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;

  const combined = collapsedOutputs.join('\n\n---\n\n');
  const targetLines = TARGET_LINE_COUNTS[length as AudioLength] || TARGET_LINE_COUNTS.default;

  // Calculate number of chunks needed
  const numChunks = Math.ceil(targetLines / DIALOGUE_CHUNK_SIZE);

  logInfo({
    agent: 'AudioOverviewGraph',
    phase: 'write_script',
    promptLength: combined.length,
    targetLines,
    numChunks,
  }, `Generating dialogue script (~${targetLines} lines in ${numChunks} chunks)`);

  let fullDialogueScript: DialogueLine[] = [];

  // Track only examples to prevent repetition
  const coveredExamples = new Set<string>();

  try {
    // Generate dialogue in chunks to avoid token limits
    for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
      const linesThisChunk = Math.min(DIALOGUE_CHUNK_SIZE, targetLines - (chunkIndex * DIALOGUE_CHUNK_SIZE));
      const estimatedWordsThisChunk = linesThisChunk * ESTIMATED_WORDS_PER_LINE;

      // Build covered examples prompt for anti-repetition
      let coveredTopicsPrompt = '';
      if (chunkIndex > 0 && coveredExamples.size > 0) {
        coveredTopicsPrompt = buildCoveredTopicsPrompt(Array.from(coveredExamples));
      }

      // Build context from previous chunks for continuity
      const previousDialogue = chunkIndex > 0
        ? `\n\nRECENT DIALOGUE (for continuity only - continue naturally from here):\n${fullDialogueScript.slice(-4).map(l => `${l.speaker}: ${l.text}`).join('\n')}\n`
        : '';

      const chunkPrompt = getReducePrompt({
        content: combined + previousDialogue,
        audioType: audioType as AudioType,
        length: length as AudioLength,
        focus: sanitizedFocus || 'general overview',
        targetLines: linesThisChunk,
        coveredTopicsPrompt,
      });

      logInfo({
        agent: 'AudioOverviewGraph',
        phase: 'write_script_chunk',
        chunkIndex: chunkIndex + 1,
        totalChunks: numChunks,
        targetLines: linesThisChunk,
      }, `Generating chunk ${chunkIndex + 1}/${numChunks}`);

      // Timeout + Retry wrapper for resilient LLM calls
      const response = await invokeWithRetry(
        () => invokeWithTimeout(
          () => smartLlm.invoke([
            new SystemMessage(REDUCE_SYSTEM_PROMPT),
            new HumanMessage(chunkPrompt),
          ], createLangSmithRunConfig({
            runName: 'AudioOverviewGraph.WriteScript',
            tags: ['agent', 'audio-overview', 'reduce'],
            metadata: {
              chunkIndex: chunkIndex + 1,
              totalChunks: numChunks,
              audioType,
              length,
              focus: sanitizedFocus || 'general overview',
            },
          })),
          GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
          'AudioReduce'
        ),
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          onRetry: (attempt, error) => {
            logWarn({
              agent: 'AudioOverviewGraph',
              phase: 'write_script_chunk',
              chunkIndex: chunkIndex + 1,
              attempt,
              error: error.message,
            }, `Retry attempt ${attempt}/3`);
          }
        },
        'AudioReduce'
      );

      const responseText = String((response as { content: { toString: () => string } }).content);

      logInfo({
        agent: 'AudioOverviewGraph',
        phase: 'write_script_chunk',
        chunkIndex: chunkIndex + 1,
        responseLength: responseText.length,
      }, `Received response (${responseText.length} chars)`);

      // Robust JSON extraction
      const jsonStart = responseText.indexOf('[');
      const jsonEnd = responseText.lastIndexOf(']');

      if (jsonStart === -1 || jsonEnd === -1) {
        logWarn({
          agent: 'AudioOverviewGraph',
          phase: 'write_script_chunk',
          chunkIndex: chunkIndex + 1,
          responsePreview: responseText.slice(0, 500),
        }, 'No JSON array found in response');
        continue;
      }

      const jsonStr = responseText.substring(jsonStart, jsonEnd + 1);

      try {
        const chunkDialogue = JSON.parse(jsonStr) as DialogueLine[];

        // Validate structure
        if (!Array.isArray(chunkDialogue) || chunkDialogue.length === 0 ||
            !chunkDialogue.every(line => 'speaker' in line && 'text' in line)) {
          throw new Error('Invalid dialogue script structure');
        }

        logInfo({
          agent: 'AudioOverviewGraph',
          phase: 'write_script_chunk',
          chunkIndex: chunkIndex + 1,
          linesGenerated: chunkDialogue.length,
        }, `Successfully parsed ${chunkDialogue.length} lines`);

        fullDialogueScript = fullDialogueScript.concat(chunkDialogue);

        // Extract examples from this chunk using LLM
        try {
          const extractionPrompt = `Analyze this dialogue excerpt and extract ONLY concrete examples, analogies, or real-world applications mentioned.

Return a JSON array:
["example 1", "example 2", "example 3"]

Rules:
- Only extract UNIQUE examples/analogies (not common phrases like "the idea")
- Maximum 5 examples
- Examples are things like: "GPS navigation", "8-puzzle", "robot vacuum", "protein folding"
- Ignore general concepts and filler words

DIALOGUE:
${chunkDialogue.map(d => `${d.speaker}: ${d.text}`).join('\n')}`;

          const extractionResponse = await smartLlm.invoke([
            new SystemMessage(EXAMPLE_EXTRACTION_SYSTEM_PROMPT),
            new HumanMessage(extractionPrompt),
          ], createLangSmithRunConfig({
            runName: 'AudioOverviewGraph.ExampleExtraction',
            tags: ['agent', 'audio-overview', 'analysis'],
            metadata: {
              chunkIndex: chunkIndex + 1,
              linesGenerated: chunkDialogue.length,
            },
          }));

          const extractionText = extractionResponse.content.toString();
          const exJsonStart = extractionText.indexOf('[');
          const exJsonEnd = extractionText.lastIndexOf(']');

          if (exJsonStart !== -1 && exJsonEnd !== -1) {
            const extracted = JSON.parse(extractionText.substring(exJsonStart, exJsonEnd + 1));
            (extracted || []).forEach((e: string) => coveredExamples.add(e.trim()));
          }
        } catch (extractionError) {
          // Silently fail - example extraction is optional
        }

      } catch (parseError) {
        logWarn({
          agent: 'AudioOverviewGraph',
          phase: 'write_script_chunk',
          chunkIndex: chunkIndex + 1,
          error: parseError instanceof Error ? parseError.message : String(parseError),
          jsonPreview: jsonStr.slice(0, 500),
        }, 'JSON parsing failed for chunk');
      }
    }

    // If we got some dialogue but not enough, log a warning
    if (fullDialogueScript.length > 0 && fullDialogueScript.length < targetLines * 0.5) {
      logWarn({
        agent: 'AudioOverviewGraph',
        phase: 'write_script',
        targetLines,
        actualLines: fullDialogueScript.length,
      }, `Generated fewer lines than target (${fullDialogueScript.length}/${targetLines})`);
    }

    // If extraction completely failed, generate fallback
    if (fullDialogueScript.length === 0) {
      logWarn({
        agent: 'AudioOverviewGraph',
        phase: 'write_script',
      }, 'All chunks failed, using fallback script');
      fullDialogueScript = [
        { speaker: 'host_a', text: "I've analyzed the content you provided." },
        { speaker: 'host_b', text: 'What did you find most interesting?' },
        { speaker: 'host_a', text: 'There were several key points worth discussing.' },
      ];
    }

    const elapsed = Date.now() - startTime;

    logPhaseComplete({
      agent: 'AudioOverviewGraph',
      phase: 'write_script',
      dialogueLines: fullDialogueScript.length,
      processingTimeMs: elapsed,
    });
  } catch (error) {
    logError({
      agent: 'AudioOverviewGraph',
      phase: 'write_script',
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      } : String(error),
    }, 'Error writing dialogue script');

    fullDialogueScript = [
      { speaker: 'host_a', text: 'I apologize, but I had trouble processing this content.' },
      { speaker: 'host_b', text: 'That sounds frustrating. What went wrong?' },
      { speaker: 'host_a', text: 'The system encountered an error. Please try again with different content.' },
    ];
  }

  return {
    ...state,
    dialogueScript: fullDialogueScript,
    status: 'synthesizing',
    progress: {
      phase: 'write_script',
      percentage: 60,
      message: `Generated ${fullDialogueScript.length} dialogue lines`,
      dialogueLines: fullDialogueScript.length,
    },
  };
}

// ============================================================
// AudioOverviewGraph Class
// ============================================================

/**
 * AudioOverviewGraph class that orchestrates audio overview generation.
 * This is the main class that users interact with.
 */

import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { StateGraph } from '@langchain/langgraph';
import type { CompiledStateGraph } from '@langchain/langgraph';

export class AudioOverviewGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private openai: OpenAI;

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.3,
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.6,
    });

    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  /**
   * Route to map phase - creates Send objects for parallel processing.
   */
  routeToMap(state: OverallStateType): Send[] | 'collapse' {
    if (state.chunks.length === 0) {
      logWarn({
        agent: 'AudioOverviewGraph',
        phase: 'route_to_map',
      }, 'No chunks to process, routing to collapse');
      return 'collapse';
    }

    const validatedChunks = validateChunks(state.chunks);
    const packedChunks = packChunks(validatedChunks);

    logInfo({
      agent: 'AudioOverviewGraph',
      phase: 'route_to_map',
      originalChunks: state.chunks.length,
      validatedChunks: validatedChunks.length,
      packedChunks: packedChunks.length,
      audioType: state.audioType,
      length: state.length,
    }, `Creating ${packedChunks.length} parallel map tasks`);

    return packedChunks.map((chunk, idx) =>
      new Send('extract_beats', {
        chunk,
        chunkIndex: idx,
        totalChunks: packedChunks.length,
        audioType: state.audioType,
        length: state.length,
        focus: state.focus,
      })
    );
  }

  /**
   * Build the state graph for audio overview generation.
   */
  buildGraph(): CompiledStateGraph<OverallStateType, any, any, any, any, any, any, any, any> {
    const builder = new StateGraph(OverallState);

    // Bind node functions to this instance
    builder.addNode('extract_beats', (s: ChunkProcessState) => extractBeats(s, this.fastLlm));
    builder.addNode('collapse', (s: OverallStateType) => collapse(s));
    builder.addNode('write_script', (s: OverallStateType) => writeScript(s, this.smartLlm));
    builder.addNode('synthesize_audio', (s: OverallStateType) => this.synthesizeAudio(s));

    builder.addConditionalEdges(START, (s: OverallStateType) => this.routeToMap(s));
    builder.addEdge('extract_beats' as never, 'collapse' as never);
    builder.addEdge('collapse' as never, 'write_script' as never);
    builder.addEdge('write_script' as never, 'synthesize_audio' as never);
    builder.addEdge('synthesize_audio' as never, END as never);

    return builder.compile();
  }

  /**
   * Synthesize audio from dialogue script (TTS phase).
   */
  async synthesizeAudio(state: OverallStateType): Promise<Partial<OverallStateType>> {
    const { dialogueScript } = state;

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
            this.openai.audio.speech.create({
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
}

import { StateGraph, START, END, Send, Annotation } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createClient } from '@deepgram/sdk';
import { env } from '../../config/env.js';

// Shared utilities for production-level patterns
import {
  invokeWithTimeout,
  invokeWithRetry,
  RetryConfig,
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
  ChunkConfig,
  logInfo,
  logWarn,
  logError,
  logPhaseStart,
  logPhaseComplete,
  logBanner,
  sanitizeUserInput,
} from './shared/index.js';

// Configuration constants
const GRAPH_CONFIG = {
  MAP_CHUNK_SIZE: parseInt(env.AUDIO_MAP_CHUNK_SIZE || '15000', 10),
  REDUCE_CHUNK_SIZE: parseInt(env.AUDIO_REDUCE_CHUNK_SIZE || '40000', 10),
  MAP_TIMEOUT_MS: parseInt(env.AUDIO_MAP_TIMEOUT_MS || '180000', 10),
  REDUCE_TIMEOUT_MS: parseInt(env.AUDIO_REDUCE_TIMEOUT_MS || '300000', 10),
  TTS_TIMEOUT_MS: parseInt(env.AUDIO_TTS_TIMEOUT_MS || '300000', 10),
} as const;

// Voice Configuration (Deepgram Aura Models)
const VOICES = {
  host_a: 'aura-asteria-en', // Female, articulate (The "Expert")
  host_b: 'aura-orion-en',   // Male, deep voice (The "Interviewer")
} as const;

// Dialogue line interface
export interface DialogueLine {
  speaker: 'host_a' | 'host_b';
  text: string;
}

// ============================================================
// STATE DEFINITIONS (using Annotation API)
// ============================================================

export const OverallState = Annotation.Root({
  documentIds: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  chunks: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  audioType: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => 'deep_dive',
  }),
  length: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => 'default',
  }),
  focus: Annotation<string | undefined>({
    reducer: (_x: string | undefined, y?: string | undefined) => y ?? _x,
    default: () => undefined,
  }),
  mapOutputs: Annotation<string[]>({
    reducer: (x: string[], y?: string[]) => y ? x.concat(y) : x,
    default: () => [],
  }),
  collapsedOutputs: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  dialogueScript: Annotation<DialogueLine[]>({
    reducer: (_x: DialogueLine[], y?: DialogueLine[]) => y ?? _x,
    default: () => [],
  }),
  audioBuffer: Annotation<Buffer>({
    reducer: (_x: Buffer, y?: Buffer) => y ?? _x,
    default: () => Buffer.alloc(0),
  }),
  status: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => 'generating',
  }),
});

export type OverallStateType = typeof OverallState.State;

// Minimal state for parallel map processing
export interface ChunkProcessState {
  chunk: string;
  chunkIndex?: number;
  audioType: string;
  length: string;
  focus?: string;
}

// ============================================================
// MAP PROMPTS (per audio type)
// ============================================================

const MAP_PROMPTS: Record<string, string> = {
  deep_dive: `Analyze this text and extract "dialogue beats" for an engaging podcast conversation.

Focus on:
- Surprising facts or data points that would make listeners say "Wow!"
- Controversial statements or counterintuitive ideas that could spark debate
- Complex concepts that need simple analogies to understand
- Personal stories or vivid examples that bring content to life
- Discussion points that would make great conversation starters

Format as a bulleted list with clear categories:
• Surprising Facts: [bulleted list]
• Controversial Points: [bulleted list]
• Complex Concepts: [with brief explanations]
• Discussion Starters: [conversation topics]

TEXT TO ANALYZE:
{chunk}`,

  brief: `Analyze this text and extract the most essential key takeaways for a quick audio overview.

Focus on:
- Core ideas and main themes
- Critical information listeners must know
- Quick facts that capture the essence
- Actionable insights or conclusions

Format as a concise bulleted list:
• Main Ideas: [bulleted list]
• Quick Facts: [essential information]
• Key Takeaways: [2-3 bullet points max]

TEXT TO ANALYZE:
{chunk}`,

  critique: `Analyze this text from a critical perspective and extract points for an expert review.

Focus on:
- Strengths: What works well, what's effective
- Weaknesses: Areas for improvement, gaps, issues
- Notable techniques: Interesting methods, approaches
- Constructive feedback: Specific suggestions

Format as a structured critique:
• Strengths: [what works]
• Weaknesses: [what needs improvement]
• Techniques: [interesting approaches]
• Suggestions: [constructive feedback]

TEXT TO ANALYZE:
{chunk}`,

  debate: `Analyze this text for conflicting viewpoints, tensions, and debate-worthy content.

Focus on:
- Argument A: One side of the issue
- Argument B: The opposing view
- Gray areas: Nuanced positions, middle ground
- Evidence: What data supports each side

Format as debate material:
• Position A: [one viewpoint]
• Position B: [opposing viewpoint]
• Gray Areas: [nuanced aspects]
• Key Evidence: [supporting data for each side]

TEXT TO ANALYZE:
{chunk}`,
};

// ============================================================
// REDUCE PROMPT (dialogue script generation)
// ============================================================

const TARGET_LINE_COUNTS: Record<string, number> = {
  short: 15,
  default: 25,
  long: 50,
};

const REDUCE_PROMPT = `You are an expert podcast scriptwriter. Convert the following "dialogue beats" into a lively, natural conversation script between two hosts.

CRITICAL REQUIREMENT:
Output ONLY a valid JSON array of dialogue lines with this exact format:
[
  {"speaker": "host_a", "text": "..."},
  {"speaker": "host_b", "text": "..."}
]

HOST PERSONALITIES:
- host_a (Asteria - Expert): Knowledgeable, explains concepts clearly, provides specific details, cites evidence, sounds authoritative but accessible
- host_b (Orion - Interviewer): Curious, asks the "dumb" questions, plays devil's advocate, reacts with surprise ("Wait, really?", "No way!"), adds natural fillers ("Hmm", "Interesting")

GUIDELINES FOR NATURAL CONVERSATION:
1. Use natural fillers and reactions sparingly: "Wait, really?", "Hmm", "That's fascinating", "Hold on"
2. Alternate speakers naturally (not rigid A-B-A-B pattern - sometimes one speaks twice)
3. Keep dialogue segments 2-4 sentences each
4. host_a provides explanations and depth, host_b reacts and asks follow-ups
5. Start with a hook that grabs attention
6. End with a summary reflection or takeaway
7. Make it sound like two real people talking, not reading a script

AUDIO TYPE: {audioType}
TARGET LENGTH: Approximately {targetLines} dialogue lines
FOCUS AREA: {focus}

SOURCE MATERIAL (dialogue beats):
{content}

Generate the dialogue script as a JSON array. Output ONLY the JSON, no markdown formatting:`;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Wrapper around shared packChunks utility with AudioOverviewGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'AudioOverviewGraph',
  });
}

/**
 * Wrapper around shared validateChunks utility with AudioOverviewGraph logging.
 */
export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'AudioOverviewGraph',
  });
}

async function recursiveCollapse(outputs: string[], maxTokens: number): Promise<string[]> {
  if (outputs.length <= 3) {
    return outputs;
  }

  const avgTokensPerOutput = 500;
  const maxOutputsPerCollapse = Math.floor(maxTokens / avgTokensPerOutput);

  if (outputs.length <= maxOutputsPerCollapse) {
    return outputs;
  }

  const collapsed: string[] = [];
  for (let i = 0; i < outputs.length; i += maxOutputsPerCollapse) {
    const batch = outputs.slice(i, i + maxOutputsPerCollapse);
    collapsed.push(batch.join('\n\n---\n\n'));
  }

  logInfo({
    agent: 'AudioOverviewGraph',
    phase: 'recursive_collapse',
    inputCount: outputs.length,
    outputCount: collapsed.length,
  }, `Recursive collapse: ${outputs.length} -> ${collapsed.length}`);

  return collapsed;
}

// ============================================================
// AUDIO OVERVIEW GRAPH CLASS
// ============================================================

export class AudioOverviewGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private deepgram: ReturnType<typeof createClient>;

  constructor(apiKey: string, deepgramKey: string, mapModel: string, reduceModel: string) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.7,
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.7,
    });

    this.deepgram = createClient(deepgramKey);
  }

  // Helper: Convert ReadableStream to Buffer
  private async streamToBuffer(stream: ReadableStream): Promise<Buffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  // ============================================================
  // MAP NODE: Extract Dialogue Beats
  // ============================================================

  async extractBeats(state: ChunkProcessState): Promise<Partial<OverallStateType>> {
    const { chunk, audioType, length, focus, chunkIndex } = state;
    const startTime = Date.now();

    // Structured logging start
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

    const promptTemplate = MAP_PROMPTS[audioType] || MAP_PROMPTS['deep_dive'];
    const prompt = promptTemplate.replace('{chunk}', chunk);

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
          () => this.fastLlm.invoke([
            new SystemMessage('You are extracting engaging content for a podcast conversation. Extract key points that would make for interesting discussion.'),
            new HumanMessage(prompt),
          ]),
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

      output = response.content.toString();
    } catch (error) {
      // Graceful fallback on permanent failure
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

    // Structured logging complete
    logPhaseComplete({
      agent: 'AudioOverviewGraph',
      phase: 'extract_beats',
      chunkIndex,
      outputLength: output.length,
      processingTimeMs: elapsed,
    });

    return { mapOutputs: [output] };
  }

  // ============================================================
  // COLLAPSE NODE: Recursive Collapse
  // ============================================================

  async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
    const { mapOutputs } = state;

    logPhaseStart({
      agent: 'AudioOverviewGraph',
      phase: 'collapse',
      inputCount: mapOutputs.length,
    });

    const collapsed = await recursiveCollapse(mapOutputs, GRAPH_CONFIG.REDUCE_CHUNK_SIZE / 2);

    logInfo({
      agent: 'AudioOverviewGraph',
      phase: 'collapse',
      outputCount: collapsed.length,
    }, `Collapsed ${mapOutputs.length} outputs to ${collapsed.length}`);

    return {
      ...state,
      collapsedOutputs: collapsed,
      status: 'reducing',
    };
  }

  // ============================================================
  // REDUCE NODE: Generate Dialogue Script
  // ============================================================

  async writeScript(state: OverallStateType): Promise<Partial<OverallStateType>> {
    const { collapsedOutputs, audioType, length, focus } = state;
    const startTime = Date.now();

    // Structured logging start
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
    const targetLines = TARGET_LINE_COUNTS[length] || TARGET_LINE_COUNTS.default;

    const prompt = REDUCE_PROMPT
      .replace('{content}', combined)
      .replace('{audioType}', audioType)
      .replace('{targetLines}', targetLines.toString())
      .replace('{focus}', sanitizedFocus || 'general overview');

    logInfo({
      agent: 'AudioOverviewGraph',
      phase: 'write_script',
      promptLength: prompt.length,
      targetLines,
    }, `Generating dialogue script (~${targetLines} lines)`);

    let dialogueScript: DialogueLine[] = [];

    try {
      // Timeout + Retry wrapper for resilient LLM calls
      const response = await invokeWithRetry(
        () => invokeWithTimeout(
          () => this.smartLlm.invoke([
            new SystemMessage('You are an expert podcast scriptwriter. Output ONLY valid JSON arrays of dialogue lines.'),
            new HumanMessage(prompt),
          ]),
          GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
          'AudioReduce'
        ),
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          onRetry: (attempt, error) => {
            logWarn({
              agent: 'AudioOverviewGraph',
              phase: 'write_script',
              attempt,
              error: error.message,
            }, `Retry attempt ${attempt}/3`);
          }
        },
        'AudioReduce'
      );

      const responseText = response.content.toString();

      // Robust JSON extraction: find the first '[' and last ']'
      const jsonStart = responseText.indexOf('[');
      const jsonEnd = responseText.lastIndexOf(']');

      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = responseText.substring(jsonStart, jsonEnd + 1);
        try {
          dialogueScript = JSON.parse(jsonStr) as DialogueLine[];
          // Validate structure
          if (!Array.isArray(dialogueScript) || dialogueScript.length === 0 ||
              !dialogueScript.every(line => 'speaker' in line && 'text' in line)) {
            throw new Error('Invalid dialogue script structure');
          }
        } catch (parseError) {
          logWarn({
            agent: 'AudioOverviewGraph',
            phase: 'write_script',
            error: parseError instanceof Error ? parseError.message : String(parseError),
          }, 'JSON parsing failed, using fallback');
          dialogueScript = [];
        }
      }

      // If extraction failed, generate fallback
      if (dialogueScript.length === 0) {
        logWarn({
          agent: 'AudioOverviewGraph',
          phase: 'write_script',
        }, 'JSON extraction failed, using fallback script');
        dialogueScript = [
          { speaker: 'host_a', text: "I've analyzed the content you provided." },
          { speaker: 'host_b', text: 'What did you find most interesting?' },
          { speaker: 'host_a', text: 'There were several key points worth discussing.' },
        ];
      }

      const elapsed = Date.now() - startTime;

      // Structured logging complete
      logPhaseComplete({
        agent: 'AudioOverviewGraph',
        phase: 'write_script',
        dialogueLines: dialogueScript.length,
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

      dialogueScript = [
        { speaker: 'host_a', text: 'I apologize, but I had trouble processing this content.' },
        { speaker: 'host_b', text: 'That sounds frustrating. What went wrong?' },
        { speaker: 'host_a', text: 'The system encountered an error. Please try again with different content.' },
      ];
    }

    return {
      ...state,
      dialogueScript,
      status: 'synthesizing',
    };
  }

  // ============================================================
  // TTS NODE: Synthesize Audio
  // ============================================================

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

    // Container for all results
    const results: { index: number; buffer: Buffer | null }[] = [];
    const BATCH_SIZE = 5;

    // Iterate over the data in chunks
    for (let i = 0; i < dialogueScript.length; i += BATCH_SIZE) {
      // 1. Get the current batch of lines
      const batchLines = dialogueScript.slice(i, i + BATCH_SIZE);

      logInfo({
        agent: 'AudioOverviewGraph',
        phase: 'synthesize_batch',
        batch: Math.floor(i / BATCH_SIZE) + 1,
        batchLines: batchLines.length,
      }, `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}`);

      // 2. Create promises ONLY for this batch
      const batchPromises = batchLines.map(async (line, batchIdx) => {
        const globalIndex = i + batchIdx;
        const model = line.speaker === 'host_a' ? VOICES.host_a : VOICES.host_b;

        try {
          const response = await Promise.race([
            this.deepgram.speak.request(
              { text: line.text },
              { model, encoding: 'mp3' }
            ),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('TTS timeout')), GRAPH_CONFIG.TTS_TIMEOUT_MS)
            ),
          ]) as any;

          // Get stream from response (Deepgram SDK v3)
          const stream = await response.getStream();
          if (!stream) {
            throw new Error('No audio stream returned');
          }

          const buffer = await this.streamToBuffer(stream);

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

      // 3. Wait for this batch to finish before starting the next
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    // Reassemble in original order
    const sortedBuffers = results
      .sort((a, b) => a.index - b.index)
      .map(r => r.buffer)
      .filter((b): b is Buffer => b !== null);

    const successCount = sortedBuffers.length;

    // Check if enough lines succeeded
    if (successCount < dialogueScript.length * 0.5) {
      logError({
        agent: 'AudioOverviewGraph',
        phase: 'synthesize_audio',
        successCount,
        totalLines: dialogueScript.length,
      }, `Too many synthesis failures: ${successCount}/${dialogueScript.length} lines succeeded`);
      throw new Error(`Too many synthesis failures: ${successCount}/${dialogueScript.length} lines succeeded`);
    }

    // Concatenate buffers
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
    };
  }

  // ============================================================
  // ROUTE TO MAP
  // ============================================================

  routeToMap(state: OverallStateType): Send[] | 'collapse' {
    if (state.chunks.length === 0) {
      logWarn({
        agent: 'AudioOverviewGraph',
        phase: 'route_to_map',
      }, 'No chunks to process, routing to collapse');
      return 'collapse';
    }

    const validatedChunks = validateChunks(state.chunks);
    const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE);

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
        audioType: state.audioType,
        length: state.length,
        focus: state.focus,
      })
    );
  }

  // ============================================================
  // BUILD GRAPH
  // ============================================================

  buildGraph() {
    const builder = new StateGraph(OverallState);

    builder.addNode('extract_beats', (s: ChunkProcessState) => this.extractBeats(s));
    builder.addNode('collapse', (s: OverallStateType) => this.collapse(s));
    builder.addNode('write_script', (s: OverallStateType) => this.writeScript(s));
    builder.addNode('synthesize_audio', (s: OverallStateType) => this.synthesizeAudio(s));

    builder.addConditionalEdges(START, (s: OverallStateType) => this.routeToMap(s));
    builder.addEdge('extract_beats' as never, 'collapse' as never);
    builder.addEdge('collapse' as never, 'write_script' as never);
    builder.addEdge('write_script' as never, 'synthesize_audio' as never);
    builder.addEdge('synthesize_audio' as never, END as never);

    return builder.compile();
  }
}

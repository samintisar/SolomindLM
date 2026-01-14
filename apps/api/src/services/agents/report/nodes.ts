/**
 * Node functions and main class for ReportGraph.
 *
 * Contains all node logic for validate_input, map_process, collapse,
 * reduce, and merge_results phases, along with the main ReportGraph class.
 */

import { StateGraph, START, END, Send } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { env } from '../../../config/env.js';

// Shared utilities for production-level patterns
import {
  invokeWithTimeout,
  invokeWithRetry,
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
  countTokens,
  clearStateKeys,
  allWithConcurrency,
} from '../shared/index.js';

// Import from local modules
import { OverallState, type OverallStateType, type ChunkProcessState } from './state.js';
import { MAP_PROMPTS, REDUCE_PROMPTS } from './prompts.js';

// ============================================================
// CONFIGURATION
// ============================================================

const GRAPH_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.REPORT_MAP_CHUNK_TOKENS || '5000', 10), // ~20K chars ≈ 5K tokens
  REDUCE_CHUNK_SIZE_TOKENS: parseInt(env.REPORT_REDUCE_CHUNK_TOKENS || '15000', 10), // ~60K chars ≈ 15K tokens
  MAP_TIMEOUT_MS: parseInt(env.REPORT_MAP_TIMEOUT_MS || '200000', 10),
  REDUCE_TIMEOUT_MS: parseInt(env.REPORT_REDUCE_TIMEOUT_MS || '300000', 10),
} as const;

const PROCESSING_CONFIG = {
  MIN_CHUNK_LENGTH: 50,
  MAX_CHUNK_LENGTH: 50000,
  COLLAPSE_BUFFER_RATIO: 0.8,
  PREVIEW_LENGTH: 100,
  HASH_START_LENGTH: 50,
  HASH_END_LENGTH: 20,
  OUTPUT_PREVIEW_LENGTH: 300,
  TOPIC_PREVIEW_LENGTH: 150,
  LOG_PREVIEW_LENGTH: 500,
  MAX_TOPICS_PER_CHUNK: 5,
  TOKEN_ESTIMATION_RATIO: 3,
  TOPIC_CACHE_SIZE: 100,
  TOPIC_CACHE_KEY_LENGTH: 200,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_BACKOFF_MS: 1000,
  MAX_PROMPT_LENGTH: 5000,
} as const;

// ============================================================
// STRUCTURED OUTPUT SCHEMAS
// ============================================================

/**
 * Zod schema for structured map phase output.
 * This ensures reliable topic extraction without fragile regex parsing.
 */
export const MapOutputSchema = z.object({
  topics: z.array(z.string())
    .min(1, 'At least one topic is required')
    .max(5, 'Maximum 5 topics allowed')
    .describe('3-5 key topics that this section covers, ordered by importance'),
  summary: z.string()
    .min(50, 'Summary must be at least 50 characters')
    .max(10000, 'Summary must not exceed 10000 characters')
    .describe('The complete structured summary including all sections (Key Insights, Main Themes, Supporting Evidence, etc.)'),
});

export type MapOutput = z.infer<typeof MapOutputSchema>;

// Interface for the structured LLM to avoid deep type instantiation
interface MapOutputInvoker {
  invoke(messages: Array<SystemMessage | HumanMessage>): Promise<MapOutput>;
}

/**
 * Helper function to create a structured LLM without triggering deep type instantiation.
 * TypeScript tries to infer the full generic chain of withStructuredOutput, which exceeds
 * its recursion limits. We use a local any cast to break this chain while preserving
 * type safety through the MapOutputInvoker interface.
 */
function createStructuredLLM(llm: ChatTogetherAI, schema: z.ZodTypeAny): MapOutputInvoker {
  // @ts-ignore - Type instantiation is excessively deep with LangChain's withStructuredOutput
  return llm.withStructuredOutput(schema, {
    name: 'extract_topics_and_summary',
  }) as any;
}

// ============================================================
// CHUNK HELPERS
// ============================================================

/**
 * Wrapper around shared packChunks utility with ReportGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: PROCESSING_CONFIG.MIN_CHUNK_LENGTH,
    maxChunkLength: PROCESSING_CONFIG.MAX_CHUNK_LENGTH,
    agentName: 'ReportGraph',
  });
}

/**
 * Wrapper around shared validateChunks utility with ReportGraph logging.
 */
export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS,
    minChunkLength: PROCESSING_CONFIG.MIN_CHUNK_LENGTH,
    maxChunkLength: PROCESSING_CONFIG.MAX_CHUNK_LENGTH,
    agentName: 'ReportGraph',
  });
}

// ============================================================
// REPORT GRAPH CLASS
// ============================================================

/**
 * ReportGraph class that orchestrates report generation.
 * This is the main class that users interact with.
 */
export class ReportGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private fastLlmStructured: MapOutputInvoker;
  private maxTokens: number;

  constructor(apiKey: string, mapModel: string, reduceModel: string, maxTokens: number = 64000) {
    // Fast model for map phase (parallel content extraction)
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.3,
      timeout: GRAPH_CONFIG.MAP_TIMEOUT_MS,
      maxTokens: parseInt(env.REPORT_MAP_MAX_OUTPUT_TOKENS || '8192', 10),
    });

    // Smart model for reduce/merge phases (quality writing and synthesis)
    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.5,
      timeout: GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
      maxTokens: parseInt(env.REPORT_REDUCE_MAX_OUTPUT_TOKENS || '32000', 10),
    });

    // Fast model with structured output for reliable topic extraction
    this.fastLlmStructured = createStructuredLLM(this.fastLlm, MapOutputSchema);

    this.maxTokens = maxTokens;
  }

  private estimateTokens(text: string): number {
    // Use accurate token counting via tiktoken
    return countTokens(text);
  }

  // Generate a short hash for identifying chunks in logs
  private chunkHash(chunk: string): string {
    const start = chunk.substring(0, PROCESSING_CONFIG.HASH_START_LENGTH).replace(/\n/g, ' ');
    const end = chunk.substring(Math.max(0, chunk.length - PROCESSING_CONFIG.HASH_END_LENGTH)).replace(/\n/g, ' ');
    return `[${chunk.length} chars] "${start}..."..."${end}"`;
  }

  /**
   * Sanitize custom prompt input.
   * Since we use LangChain's message structure (SystemMessage/HumanMessage),
   * we only need to prevent template injection via the {customPrompt} placeholder.
   * This is much less aggressive than the previous implementation and preserves
   * legitimate user content like "system requirements:" or dialogue in novels.
   */
  private sanitizeUserInput(input: string): string {
    if (!input) return '';

    return input
      // Normalize excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Prevent template injection by removing potential template variable patterns
      .replace(/\{.*?\}/g, '')
      // Remove special token markers used by some models
      .replace(/<\|.*?\|>/g, '')
      .trim()
      .substring(0, PROCESSING_CONFIG.MAX_PROMPT_LENGTH);
  }

  // Helper method to invoke with timeout and proper cleanup
  private async invokeWithTimeout<T>(
    invokeFn: () => Promise<T>,
    timeoutMs: number,
    phase: string
  ): Promise<T> {
    let timeoutId!: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${phase} timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([invokeFn(), timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error(`${phase} phase exceeded timeout of ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  // Helper to extract message content safely
  private getMessageContent(response: unknown): string {
    if (typeof response === 'object' && response !== null) {
      const msg = response as { content?: unknown };
      if (typeof msg.content === 'string') {
        return msg.content;
      }
      if (typeof msg.content === 'object' && msg.content !== null) {
        if (typeof (msg.content as { toString?: () => string }).toString === 'function') {
          return (msg.content as { toString: () => string }).toString();
        }
      }
    }
    return String(response);
  }

  // Retry logic with exponential backoff
  private async invokeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
    phase: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (error instanceof Error &&
            (error.message.includes('Invalid') ||
             error.message.includes('validation') ||
             error.message.includes('timeout'))) {
          throw error;
        }

        console.warn(
          `[ReportGraph] ${phase} attempt ${attempt + 1}/${maxRetries} failed:`,
          error instanceof Error ? error.message : String(error)
        );

        if (attempt < maxRetries - 1) {
          const backoff = PROCESSING_CONFIG.RETRY_BACKOFF_MS * Math.pow(2, attempt);
          console.log(`[ReportGraph] Retrying ${phase} in ${backoff}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    throw lastError || new Error(`${phase} failed after ${maxRetries} attempts`);
  }

  // Group map outputs by extracted topics for analysis
  // Handles both JSON (MapOutput from map phase) and Markdown (from collapse phase)
  private groupOutputsByTopic(outputs: string[]): Record<string, number> {
    const topics: Record<string, number> = {};

    for (const output of outputs) {
      const extractedTopics = this.extractTopicsFromOutput(output);
      const primaryTopic = extractedTopics[0] || 'Unknown';
      topics[primaryTopic] = (topics[primaryTopic] || 0) + 1;
    }

    return topics;
  }

  // Analyze all topics from outputs for comprehensive logging
  // Handles both JSON (MapOutput from map phase) and Markdown (from collapse phase)
  private analyzeAllTopics(outputs: string[]): { topics: Record<string, number>, allTopics: string[] } {
    const topicCounts: Record<string, number> = {};
    const allTopics: string[] = [];

    for (const output of outputs) {
      const topics = this.extractTopicsFromOutput(output);
      allTopics.push(...topics);

      for (const topic of topics) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }

    return { topics: topicCounts, allTopics };
  }

  /**
   * Extract topics from an output string.
   * Handles both JSON format (MapOutput from map phase) and Markdown format (from collapse phase).
   */
  private extractTopicsFromOutput(output: string): string[] {
    // Try JSON format first (MapOutput from structured LLM)
    try {
      const parsed = JSON.parse(output) as MapOutput;
      if (parsed.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
        return parsed.topics;
      }
    } catch {
      // Not JSON, continue to Markdown parsing
    }

    // Fall back to Markdown parsing (for collapsed outputs)
    return this.extractTopicsFromMarkdown(output);
  }

  /**
   * Extract topics from Markdown text.
   * Looks for "Main Topics:" sections and handles various list formats.
   */
  private extractTopicsFromMarkdown(markdown: string): string[] {
    const topics: string[] = [];
    const cleanOutput = markdown.replace(/\*\*/g, '').trim();

    // Strategy A: Look for "Main Topics:" followed by a list
    const mainTopicsMatch = cleanOutput.match(/Main Topics:?([\s\S]+?)(?=\n\n|\n[A-Z][a-z]+:|- Key Insights|- Learning Objectives|Key Concepts|Main Themes|Supporting Evidence|Action Items|Potential Quiz|Notable Quotes|Actionable Advice|Key Evidence|Important Conclusions|Technical Specifications|Methodologies|Data and Metrics|Findings|Core Concepts|Relationships|Examples|Common Misconceptions|Research Methods|Frameworks Applied|Data Collection|Analysis Approaches|##|$)/i);

    if (mainTopicsMatch) {
      const content = mainTopicsMatch[1].trim();

      // Handle comma-separated list (e.g., "Topic A, Topic B, Topic C")
      if (content.includes(',') && !content.includes('\n')) {
        content.split(',').forEach(t => {
          const topic = t.trim().replace(/^-\s*/, '').replace(/^\d+\.\s*/, '');
          if (topic.length > 2 && topic.length < 100) {
            topics.push(topic);
          }
        });
      }
      // Handle bulleted/numbered list (e.g., "- Topic A \n - Topic B")
      else {
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          // Skip empty lines and section headers
          if (!trimmed || /^[A-Z][a-z]+:/.test(trimmed)) continue;

          const topic = trimmed.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '');
          if (topic.length > 2 && topic.length < 100) {
            topics.push(topic);
          }
        }
      }
    }

    // Strategy B: Fallback - look for any bullet points that seem like topics
    if (topics.length === 0) {
      const topicLines = cleanOutput.match(/^[-*•]\s+[A-Z].+$/gm) || [];
      for (const line of topicLines.slice(0, 5)) {
        const topic = line.replace(/^[-*•]\s+/, '').trim();
        if (topic.length > 2 && topic.length < 100) {
          topics.push(topic);
        }
      }
    }

    // Deduplicate and filter noise
    const uniqueTopics = Array.from(new Set(topics))
      .filter(t => {
        const lower = t.toLowerCase();
        return !lower.includes('main topics') &&
               !lower.includes('key insights') &&
               !lower.includes('learning objectives') &&
               !lower.includes('all of the above') &&
               t.length < 100;
      });

    return uniqueTopics.length > 0 ? uniqueTopics : ['General Content'];
  }

  // Validate input state before processing
  private validateInput(state: OverallStateType): Partial<OverallStateType> {
    console.log('\n' + '='.repeat(80));
    console.log('[ReportGraph] ===== INPUT VALIDATION =====');
    console.log('='.repeat(80));

    const errors: string[] = [];

    if (!state.chunks || state.chunks.length === 0) {
      errors.push('No chunks provided for processing');
    }

    if (!state.reportType) {
      errors.push('Report type is required');
    }

    if (state.reportType && !MAP_PROMPTS[state.reportType]) {
      errors.push(`Invalid report type: ${state.reportType}. Valid types: ${Object.keys(MAP_PROMPTS).join(', ')}`);
    }

    if (errors.length > 0) {
      console.error('[ReportGraph] Validation failed:', errors);
      return {
        ...state,
        status: 'error',
        finalOutput: `# Validation Error\n\n${errors.map(e => `- ${e}`).join('\n')}\n\nPlease fix these issues and try again.`,
      };
    }

    console.log('[ReportGraph] Validation passed');
    console.log(`  - Document IDs: ${state.documentIds?.length || 0}`);
    console.log(`  - Chunks: ${state.chunks?.length || 0}`);
    console.log(`  - Report Type: ${state.reportType}`);
    console.log(`  - Custom Prompt: ${state.customPrompt ? 'Yes (' + state.customPrompt.length + ' chars)' : 'No'}`);

    return state;
  }

  // Validate report completeness for truncation detection
  private validateReportCompleteness(output: string, reportType: string): {
    isComplete: boolean;
    missing: string[];
  } {
    const missing: string[] = [];

    if (reportType === 'study_guide') {
      const requiredSections = [
        'Learning Objectives',
        'Study Notes',
        'Quiz Questions',
        'Answer Key',
        'Essay Questions',
        'Glossary'
      ];

      for (const section of requiredSections) {
        const patterns = [
          new RegExp(`##\\s*${section}`, 'i'),
          new RegExp(`###\\s*${section}`, 'i'),
          new RegExp(`\\*\\*${section}\\*\\*`, 'i'),
          new RegExp(`${section}`, 'i'),
        ];

        const found = patterns.some(pattern => pattern.test(output));

        if (!found) {
          missing.push(`Missing section: ${section}`);
        }
      }

      const quizMatches = output.match(/^\d+\.\s+.+$/gm) || [];
      if (quizMatches.length < 10) {
        missing.push(`Incomplete quiz (${quizMatches.length}/10 questions)`);
      }

      const glossaryPatterns = [
        /##\s*Glossary/i,
        /###\s*Glossary/i,
        /\*\*Glossary\*\*/i,
      ];
      const hasGlossary = glossaryPatterns.some(pattern => pattern.test(output));

      if (hasGlossary) {
        const glossaryMatch = output.match(/##\s*Glossary[\s\S]+$/i);
        if (glossaryMatch) {
          const glossaryEntries = glossaryMatch[0].match(/^[-*]\s+\*\*\w+/gm) || [];
          if (glossaryEntries.length < 5) {
            missing.push(`Incomplete glossary (${glossaryEntries.length} entries)`);
          }
        }
      }

      const lastLine = output.trim().split('\n').pop() || '';
      if (lastLine.length > 0 && !lastLine.match(/[.!?"]$/) && !lastLine.startsWith('#')) {
        missing.push('Abrupt ending detected (likely truncated)');
      }
    } else if (reportType === 'briefing' || reportType === 'summary' || reportType === 'technical_report') {
      const lastLine = output.trim().split('\n').pop() || '';
      if (lastLine.length > 0 && !lastLine.match(/[.!?]$/) && !lastLine.startsWith('#')) {
        missing.push('Abrupt ending detected (likely truncated)');
      }

      if (reportType === 'briefing') {
        const expectedSections = ['Executive Summary', 'Main Themes', 'Key Findings', 'Recommendations'];
        for (const section of expectedSections) {
          if (!new RegExp(section, 'i').test(output)) {
            missing.push(`Missing section: ${section}`);
          }
        }
      }
    }

    return {
      isComplete: missing.length === 0,
      missing,
    };
  }

  // Conditional routing function - returns Send objects for fan-out or 'collapse' string
  routeToMap(state: OverallStateType): Send[] | 'collapse' {
    console.log('\n' + '='.repeat(80));
    console.log('[ReportGraph] ===== ROUTE TO MAP PHASE =====');
    console.log('='.repeat(80));

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'route_to_map',
      documentCount: state.documentIds?.length || 0,
      documentIds: state.documentIds || [],
      chunkCount: state.chunks?.length || 0,
      reportType: state.reportType,
    }, null, 2));

    if (state.chunks && state.chunks.length > 0) {
      console.log(`\n[ReportGraph] Chunk breakdown:`);
      state.chunks.forEach((chunk, idx) => {
        const preview = this.chunkHash(chunk);
        console.log(`  [${idx + 1}/${state.chunks!.length}] ${preview.substring(0, 150)}...`);
      });
      console.log('');
    }

    if (state.chunks.length === 0) {
      console.warn('[ReportGraph] No chunks to process, routing to collapse');
      return 'collapse';
    }

    const validatedChunks = validateChunks(state.chunks);
    const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS);

    console.log(`[ReportGraph] Creating ${packedChunks.length} parallel map tasks`);

    return packedChunks.map((chunk, idx) => {
      const preview = chunk.substring(0, 100).replace(/\n/g, ' ');
      console.log(`  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (${chunk.length} chars)`);
      return new Send('map_process', {
        chunk,
        chunkIndex: idx,
        totalChunks: packedChunks.length,
        reportType: state.reportType,
        customPrompt: state.customPrompt,
      });
    });
  }

  // Node: Map phase (runs in parallel via Send)
  async mapProcess(state: ChunkProcessState): Promise<Partial<OverallStateType>> {
    const { chunk, chunkIndex, reportType, customPrompt } = state;
    const startTime = Date.now();

    const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : '[Chunk ?]';
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[ReportGraph] ===== MAP PROCESS PHASE ${chunkId} =====`);
    console.log('='.repeat(80));
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'map_process',
      chunkIndex: chunkIndex,
      chunkLength: chunk.length,
      chunkPreview: chunk.substring(0, 150).replace(/\n/g, ' '),
      reportType: reportType,
    }, null, 2));

    // Build prompt for structured output
    const promptTemplate = MAP_PROMPTS[reportType] || MAP_PROMPTS['custom'];
    const prompt = promptTemplate
      .replace('{chunk}', chunk)
      .replace('{customPrompt}', this.sanitizeUserInput(customPrompt || ''));

    // Add instruction for structured output
    const structuredPrompt = `${prompt}

IMPORTANT: Respond with a JSON object containing:
1. "topics": An array of 3-5 key topics this section covers
2. "summary": The complete structured summary as described above`;

    console.log(`[ReportGraph] ${chunkId} Sending prompt to LLM (${prompt.length} chars)...`);

    let mapOutput: MapOutput;
    try {
      mapOutput = await this.invokeWithRetry<MapOutput>(
        () => this.invokeWithTimeout(
          () => this.fastLlmStructured.invoke([
            new SystemMessage('You are a professional content analyzer and writer. Always extract 3-5 key topics and provide comprehensive summaries.'),
            new HumanMessage(structuredPrompt),
          ]),
          GRAPH_CONFIG.MAP_TIMEOUT_MS,
          'Map'
        ),
        PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
        `Map ${chunkId}`
      );
    } catch (error) {
      const errorContext = {
        timestamp: new Date().toISOString(),
        chunkId,
        chunkLength: chunk.length,
        reportType,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        } : String(error),
      };
      console.error('[ReportGraph] Map process error:', JSON.stringify(errorContext, null, 2));
      throw error;
    }

    const elapsed = Date.now() - startTime;

    // Serialize MapOutput to JSON for storage in state
    const outputJson = JSON.stringify(mapOutput);
    const extractedTopics = mapOutput.topics;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'map_process_complete',
      chunkIndex: chunkIndex,
      outputLength: outputJson.length,
      summaryLength: mapOutput.summary.length,
      processingTimeMs: elapsed,
      extractedTopics: extractedTopics,
      summaryPreview: mapOutput.summary.substring(0, 300).replace(/\n/g, ' '),
    }, null, 2));

    console.log(`[ReportGraph] ${chunkId} Extracted topics: ${extractedTopics.join(', ')}`);

    return {
      mapOutputs: [outputJson],
      progress: {
        phase: 'map_process',
        percentage: Math.min(10 + ((chunkIndex ?? 0) * 30), 60),
        message: `Chunk ${(chunkIndex ?? 0) + 1}/${state.totalChunks ?? '?'} complete`,
        chunksCompleted: (chunkIndex ?? 0) + 1,
        totalChunks: state.totalChunks,
      },
    };
  }

  // Node: Collapse phase (if needed)
  async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
    console.log(`\n${'='.repeat(80)}`);
    console.log('[ReportGraph] ===== COLLAPSE PHASE =====');
    console.log('='.repeat(80));

    // Extract summaries from structured MapOutput JSON
    const summaries: string[] = [];
    const mapOutputsDetails = state.mapOutputs.map((output, idx) => {
      const parsed = JSON.parse(output) as MapOutput;
      const summary = parsed.summary;
      const topics = parsed.topics;
      summaries.push(summary);
      return {
        index: idx,
        length: output.length,
        topics,
        preview: summary.substring(0, 100).replace(/\n/g, ' '),
      };
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'collapse',
      mapOutputsReceived: state.mapOutputs.length,
      mapOutputsDetails,
    }, null, 2));

    const { topics: topicDistribution, allTopics } = this.analyzeAllTopics(state.mapOutputs);
    console.log(`[ReportGraph] Topic distribution across map outputs:`, JSON.stringify(topicDistribution, null, 2));
    console.log(`[ReportGraph] All unique topics found: ${Array.from(new Set(allTopics)).join(', ')}`);

    if (!state.mapOutputs || state.mapOutputs.length === 0) {
      console.error('[ReportGraph] Collapse: ERROR - No mapOutputs received!');
      return {
        ...state,
        collapsedOutputs: [],
        status: 'reducing',
      };
    }

    const totalTokens = summaries.reduce(
      (sum, s) => sum + this.estimateTokens(s),
      0
    );

    console.log(`[ReportGraph] Collapse: total tokens ${totalTokens}`);

    console.log('[ReportGraph] Collapse: performing recursive collapse');
    const collapsed = await this.recursiveCollapse(summaries);

    // Calculate memory freed before clearing
    const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
    console.log(`[ReportGraph] Collapse: freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`);

    return {
      ...state,
      collapsedOutputs: collapsed,
      status: 'reducing',
      // Clear mapOutputs to free memory - no longer needed after collapse
      ...clearStateKeys<OverallStateType>(['mapOutputs']),
      progress: {
        phase: 'collapse',
        percentage: 70,
        message: `Collapsed ${state.mapOutputs.length} outputs into ${collapsed.length}`,
      },
    };
  }

  private async recursiveCollapse(summaries: string[]): Promise<string[]> {
    if (summaries.length <= 3) {
      return summaries;
    }

    const targetGroupSize = 4;
    const groups: string[][] = [];
    let currentGroup: string[] = [];

    for (const summary of summaries) {
      if (currentGroup.length >= targetGroupSize) {
        groups.push([...currentGroup]);
        currentGroup = [summary];
      } else {
        currentGroup.push(summary);
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    const concurrency = parseInt(env.REPORT_COLLAPSE_CONCURRENCY || '5', 10);
    console.log(`[ReportGraph] Collapsing ${groups.length} groups with concurrency limit of ${concurrency}`);
    const collapsed = await allWithConcurrency(
      groups.map((group, idx) => {
        console.log(`[ReportGraph] Collapsing group ${idx + 1}/${groups.length} (${group.length} summaries)`);
        return () => this.collapseGroup(group);
      }),
      concurrency
    );

    return this.recursiveCollapse(collapsed);
  }

  private async collapseGroup(group: string[]): Promise<string> {
    const combined = group.join('\n\n---\n\n');

    const prompt = `Condense these summaries while PRESERVING the structured format.
Keep the "Main Topics:" section intact with all topic listings.
Only condense the detailed explanations while maintaining the overall structure.

${combined}

CONDENSED (maintain topic structure and "Main Topics:" format):`;

    const response = await this.invokeWithRetry(
      () => this.invokeWithTimeout(
        () => this.smartLlm.invoke([
          new SystemMessage('You are a skilled summarizer. Always maintain structured format with topic headers like "Main Topics:"'),
          new HumanMessage(prompt),
        ]),
        GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
        'CollapseGroup'
      ),
      PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
      'CollapseGroup'
    );

    return this.getMessageContent(response);
  }

  // Node: Reduce phase
  async reduce(state: OverallStateType): Promise<Partial<OverallStateType>> {
    console.log(`\n${'='.repeat(80)}`);
    console.log('[ReportGraph] ===== REDUCE PHASE =====');
    console.log('='.repeat(80));

    // Store counts before clearing for logging
    const collapsedOutputsCount = state.collapsedOutputs.length;
    const chunksCount = state.chunks?.length || 0;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'reduce',
      collapsedOutputsCount,
      reportType: state.reportType,
    }, null, 2));

    const { topics: topicDistribution, allTopics } = this.analyzeAllTopics(state.collapsedOutputs);

    const validTopics = Array.from(new Set(allTopics)).filter(t =>
      !t.includes('Error') && !t.includes('error') && !t.includes('timeout') && !t.includes('Unknown')
    );

    console.log(`[ReportGraph] Topic distribution before reduce:`, JSON.stringify(topicDistribution, null, 2));
    console.log(`[ReportGraph] Total unique topics to synthesize: ${validTopics.length}`);
    console.log(`[ReportGraph] Valid topics: ${validTopics.join(', ')}`);

    const combined = state.collapsedOutputs.join('\n\n---\n\n');

    console.log(`[ReportGraph] Reduce: combined content length: ${combined.length} chars`);

    let promptTemplate = REDUCE_PROMPTS[state.reportType] || REDUCE_PROMPTS['custom'];

    if (validTopics.length > 0) {
      const topicList = validTopics.map((t, i) => `${i + 1}. ${t}`).join('\n');
      const topicRequirement = `

====================
EXPLICIT TOPIC COVERAGE REQUIREMENT
====================
You MUST create dedicated sections for EACH of the following ${validTopics.length} topics:
${topicList}

Each topic must receive approximately equal attention (${Math.round(100 / validTopics.length)}% of content each).
Do NOT combine topics or focus primarily on one.
====================

`;

      promptTemplate = promptTemplate.replace(
        /(CRITICAL REQUIREMENT[\s\S]*?)(\n\n##|Create a comprehensive)/,
        `$1${topicRequirement}$2`
      );
    }

    const prompt = promptTemplate
      .replace('{content}', combined)
      .replace('{customPrompt}', this.sanitizeUserInput(state.customPrompt || ''));

    console.log(`[ReportGraph] Reduce: prompt length: ${prompt.length} chars`);
    console.log(`[ReportGraph] Reduce: prompt preview: ${prompt.substring(0, 500)}...`);

    const startTime = Date.now();
    let finalOutput: string;

    try {
      const response = await this.invokeWithRetry(
        () => this.invokeWithTimeout(
          () => this.smartLlm.invoke([
            new SystemMessage('You are a professional content writer and editor.'),
            new HumanMessage(prompt),
          ]),
          GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
          'Reduce'
        ),
        PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
        'Reduce'
      );

      const responseAny = response as any;
      const metadata = responseAny.response_metadata || {};
      const finishReason = metadata.finish_reason || metadata.tokenUsage?.finish_reason;

      console.log('[ReportGraph] ===== RESPONSE ANALYSIS =====');
      console.log('[ReportGraph] Content length:', responseAny.content?.toString()?.length || 'N/A');
      console.log('[ReportGraph] Estimated tokens:', Math.ceil((responseAny.content?.toString()?.length || 0) / 3));
      console.log('[ReportGraph] Finish reason:', finishReason);
      console.log('[ReportGraph] Token usage:', JSON.stringify(metadata.token_usage || metadata));
      console.log('[ReportGraph] Last 200 chars:', (responseAny.content?.toString() || '').slice(-200));
      console.log('[ReportGraph] =====================================');

      finalOutput = this.getMessageContent(response);

      if (finishReason === 'length') {
        console.error('[ReportGraph] ⚠️ OUTPUT TRUNCATED BY TOKEN LIMIT!');
        console.error('[ReportGraph] Increase REPORT_REDUCE_MAX_OUTPUT_TOKENS in env');

        finalOutput += '\n\n---\n\n⚠️ **This report was truncated due to output length limits. ' +
          'To generate a complete report, increase the REPORT_REDUCE_MAX_OUTPUT_TOKENS setting ' +
          'or reduce the number of source documents.**';
      }

      const validation = this.validateReportCompleteness(finalOutput, state.reportType);
      if (!validation.isComplete) {
        console.warn('[ReportGraph] Report validation issues:', validation.missing);
        if (finishReason === 'length') {
          console.error('[ReportGraph] Confirmed: truncation likely caused incompleteness');
        }
      }
    } catch (error) {
      const errorContext = {
        timestamp: new Date().toISOString(),
        reportType: state.reportType,
        collapsedOutputsCount: state.collapsedOutputs.length,
        contentLength: combined.length,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        } : String(error),
      };
      console.error('[ReportGraph] Reduce phase error:', JSON.stringify(errorContext, null, 2));

      finalOutput = `# Report Generation Error

**Error:** ${error instanceof Error ? error.message : 'Unknown error'}

**Details:**
- Report Type: ${state.reportType}
- Input Size: ${combined.length} characters
- Processed Chunks: ${collapsedOutputsCount}

The report generation could not be completed due to a timeout or error. Please try again with fewer documents or a shorter report type.`;
    }

    const elapsed = Date.now() - startTime;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'reduce_complete',
      finalOutputLength: finalOutput.length,
      processingTimeMs: elapsed,
      outputPreview: finalOutput.substring(0, 200).replace(/\n/g, ' '),
    }, null, 2));

    console.log(`[ReportGraph] Reduce: final output length: ${finalOutput.length} chars (took ${elapsed}ms)`);

    // Calculate memory to be freed
    const collapsedOutputsSize = state.collapsedOutputs.reduce((sum, s) => sum + s.length * 2, 0);
    const chunksSize = (state.chunks || []).reduce((sum, s) => sum + s.length * 2, 0);
    console.log(`[ReportGraph] Reduce: freeing ~${((collapsedOutputsSize + chunksSize) / 1024).toFixed(2)} KB from intermediate data`);

    return {
      ...state,
      finalOutput,
      status: 'completed',
      // Clear collapsedOutputs and chunks to free memory - no longer needed after reduce
      ...clearStateKeys<OverallStateType>(['collapsedOutputs', 'chunks']),
      progress: {
        phase: 'reduce',
        percentage: 100,
        message: `Completed: ${state.reportType} report generated`,
      },
    };
  }

  // Node: Merge final results
  private mergeResults(state: OverallStateType): Partial<OverallStateType> {
    console.log(`\n${'='.repeat(80)}`);
    console.log('[ReportGraph] ===== GENERATION COMPLETE =====');
    console.log('='.repeat(80));
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'merge_results',
      status: 'completed',
      finalOutputLength: state.finalOutput?.length || 0,
    }, null, 2));

    return {
      ...state,
      status: 'completed',
      progress: {
        phase: 'complete',
        percentage: 100,
        message: 'Report generation complete',
      },
    };
  }

  /**
   * Route to map phase - creates Send objects for parallel processing.
   */
  routeToMapPublic(state: OverallStateType): Send[] | 'collapse' {
    return this.routeToMap(state);
  }

  /**
   * Build the state graph for report generation.
   */
  buildGraph() {
    const builder = new StateGraph(OverallState);

    builder.addNode('validate_input', (s: OverallStateType) => this.validateInput(s));
    builder.addNode('map_process', (s: ChunkProcessState) => this.mapProcess(s));
    builder.addNode('collapse', (s: OverallStateType) => this.collapse(s));
    builder.addNode('reduce', (s: OverallStateType) => this.reduce(s));
    builder.addNode('merge_results', (s: OverallStateType) => this.mergeResults(s));

    builder.addEdge(START, 'validate_input' as never);

    builder.addConditionalEdges(
      'validate_input' as never,
      (s: OverallStateType) => {
        if (s.status === 'error') {
          return 'merge_results';
        }
        return this.routeToMapPublic(s);
      }
    );

    builder.addEdge('map_process' as never, 'collapse' as never);
    builder.addEdge('collapse' as never, 'reduce' as never);
    builder.addEdge('reduce' as never, 'merge_results' as never);
    builder.addEdge('merge_results' as never, END as never);

    return builder.compile();
  }
}

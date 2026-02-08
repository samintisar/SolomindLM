"use node"
/**
 * Node functions and main class for SpreadsheetGraph.
 *
 * Simplified architecture:
 * - Map: Extract text/concepts/summaries from sources (returns string)
 * - Collapse: Consolidate merged text output
 * - Reduce: Generate final CSV from consolidated text
 *
 * No structured output or Zod schemas - uses plain text throughout.
 */

import { StateGraph, START, END, Send } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { env } from '../../helpers/env';

// Shared utilities for production-level patterns
import {
  invokeWithTimeout,
  invokeWithRetry,
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
  countTokens,
  clearStateKeys,
  allWithConcurrency,
  createLangSmithRunConfig,
} from '../shared/index.js';

// Import from local modules
import { OverallState, type OverallStateType, type ChunkProcessState } from './state.js';
import { MAP_PROMPTS, REDUCE_PROMPTS, COLLAPSE_PROMPTS, MAP_SYSTEM_PROMPT, COLLAPSE_SYSTEM_PROMPT, REDUCE_SYSTEM_PROMPT } from './prompts.js';

// ============================================================
// CONFIGURATION
// ============================================================

const GRAPH_CONFIG = {
  MAP_CHUNK_SIZE_TOKENS: parseInt(env.SPREADSHEET_MAP_CHUNK_TOKENS || '5000', 10),
  REDUCE_CHUNK_SIZE_TOKENS: parseInt(env.SPREADSHEET_REDUCE_CHUNK_TOKENS || '15000', 10),
  MAP_TIMEOUT_MS: parseInt(env.SPREADSHEET_MAP_TIMEOUT_MS || '200000', 10),
  REDUCE_TIMEOUT_MS: parseInt(env.SPREADSHEET_REDUCE_TIMEOUT_MS || '300000', 10),
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
// CHUNK HELPERS
// ============================================================

/**
 * Wrapper around shared packChunks utility with SpreadsheetGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: PROCESSING_CONFIG.MIN_CHUNK_LENGTH,
    maxChunkLength: PROCESSING_CONFIG.MAX_CHUNK_LENGTH,
    agentName: 'SpreadsheetGraph',
  });
}

/**
 * Wrapper around shared validateChunks utility with SpreadsheetGraph logging.
 */
export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS,
    minChunkLength: PROCESSING_CONFIG.MIN_CHUNK_LENGTH,
    maxChunkLength: PROCESSING_CONFIG.MAX_CHUNK_LENGTH,
    agentName: 'SpreadsheetGraph',
  });
}

// ============================================================
// SPREADSHEET GRAPH CLASS
// ============================================================

/**
 * SpreadsheetGraph class that orchestrates spreadsheet generation.
 * Uses simplified map-reduce: Map extracts text, Collapse consolidates, Reduce generates CSV.
 */
export class SpreadsheetGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private maxTokens: number;

  constructor(apiKey: string, mapModel: string, reduceModel: string, maxTokens: number = 64000) {
    // Fast model for map phase (parallel text extraction)
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.3,
      timeout: GRAPH_CONFIG.MAP_TIMEOUT_MS,
      maxTokens: parseInt(env.SPREADSHEET_MAP_MAX_OUTPUT_TOKENS || '4096', 10),
    });

    // Smart model for collapse/reduce phases (consolidation and CSV generation)
    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.5,
      timeout: GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
      maxTokens: parseInt(env.SPREADSHEET_REDUCE_MAX_OUTPUT_TOKENS || '32000', 10),
    });

    this.maxTokens = maxTokens;
  }

  private estimateTokens(text: string): number {
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
   */
  private sanitizeUserInput(input: string): string {
    if (!input) return '';

    return input
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\{.*?\}/g, '')
      .replace(/<\|.*?\|>/g, '')
      .trim()
      .substring(0, PROCESSING_CONFIG.MAX_PROMPT_LENGTH);
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

  /**
   * Validate CSV completeness.
   * Checks for header row and consistent column counts.
   */
  private validateTableCompleteness(output: string, spreadsheetType: string): {
    isComplete: boolean;
    missing: string[];
  } {
    const missing: string[] = [];
    const lines = output.trim().split('\n');

    if (lines.length < 2) {
      missing.push('CSV has insufficient rows (need at least header + data)');
      return { isComplete: false, missing };
    }

    // Check for CSV format (header should have commas)
    if (!lines[0].includes(',')) {
      missing.push('Header row does not contain commas (not valid CSV)');
    }

    const headerCount = lines[0].split(',').length;

    // Check sample rows for consistency (allow small variance for quoted commas)
    const sampleIndices = [1, Math.floor(lines.length / 2), lines.length - 1];
    for (const idx of sampleIndices) {
      if (idx < lines.length && idx > 0) {
        const rowCount = lines[idx].split(',').length;
        // Allow small variance for quoted commas, but flag major discrepancies
        if (Math.abs(rowCount - headerCount) > 2) {
          missing.push(`Row ${idx + 1} has ${rowCount} columns but header has ${headerCount}`);
        }
      }
    }

    // Check for abrupt ending (last line should be complete)
    const lastLine = lines[lines.length - 1] || '';
    if (lastLine.length > 0 && lastLine.split(',').length < headerCount - 2) {
      missing.push('Last row appears incomplete (truncated output)');
    }

    // Type-specific validation
    if (spreadsheetType === 'financial_summary') {
      // Check for currency symbols or numbers
      const hasCurrency = /\$[\d,]+\.?\d*/.test(output) || /[\d,]+\.?\d*\s*(USD|EUR|GBP)/.test(output);
      if (!hasCurrency) {
        missing.push('Financial CSV should contain currency values');
      }
    }

    if (spreadsheetType === 'timeline') {
      // Check for dates
      const hasDates = /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(output) ||
                       /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i.test(output);
      if (!hasDates) {
        missing.push('Timeline CSV should contain dates');
      }
    }

    return {
      isComplete: missing.length === 0,
      missing,
    };
  }

  /**
   * Clean LLM output to ensure it is valid CSV.
   * Removes Markdown code blocks (```csv ... ```) and leading/trailing whitespace.
   * If fields are not properly quoted, attempts to fix them (RFC 4180 compliance).
   */
  private cleanCsvOutput(output: string): string {
    let cleaned = output.trim();

    // Remove markdown code blocks if present
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:csv)?\n?/, '').replace(/\n?```$/, '');
    }

    cleaned = cleaned.trim();

    // Check if CSV is already properly quoted (heuristic: first line should start with quote)
    const lines = cleaned.split('\n');
    if (lines.length > 0 && lines[0].trim().startsWith('"')) {
      // Likely already properly formatted
      return cleaned;
    }

    // Attempt to fix unquoted CSV by parsing and re-quoting
    try {
      const fixedLines: string[] = [];
      for (const line of lines) {
        if (!line.trim()) {
          continue; // Skip empty lines
        }
        
        // Parse CSV line (naive approach: split by comma, but respect quotes if present)
        const fields = this.parseCsvLine(line);
        
        // Re-quote all fields properly
        const quotedFields = fields.map(field => {
          // Escape internal quotes by doubling them
          const escaped = field.replace(/"/g, '""');
          return `"${escaped}"`;
        });
        
        fixedLines.push(quotedFields.join(','));
      }
      
      if (fixedLines.length > 0) {
        console.log('[SpreadsheetGraph] Applied RFC 4180 CSV formatting to output');
        return fixedLines.join('\n');
      }
    } catch (error) {
      console.warn('[SpreadsheetGraph] Failed to auto-format CSV, returning as-is:', error);
    }

    return cleaned;
  }

  /**
   * Parse a CSV line into fields (handles quoted fields with commas).
   * Simplified parser - not fully RFC 4180 compliant but handles most cases.
   */
  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let currentField = '';
    let insideQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        }
        insideQuotes = !insideQuotes;
        i++;
        continue;
      }

      if (char === ',' && !insideQuotes) {
        fields.push(currentField);
        currentField = '';
        i++;
        continue;
      }

      currentField += char;
      i++;
    }

    // Add the last field
    fields.push(currentField);

    return fields;
  }

  // Validate input state before processing
  private validateInput(state: OverallStateType): Partial<OverallStateType> {
    console.log('\n' + '='.repeat(80));
    console.log('[SpreadsheetGraph] ===== INPUT VALIDATION =====');
    console.log('='.repeat(80));

    const errors: string[] = [];

    if (!state.chunks || state.chunks.length === 0) {
      errors.push('No chunks provided for processing');
    }

    if (!state.spreadsheetType) {
      errors.push('Spreadsheet type is required');
    }

    if (state.spreadsheetType && !MAP_PROMPTS[state.spreadsheetType]) {
      errors.push(`Invalid spreadsheet type: ${state.spreadsheetType}. Valid types: ${Object.keys(MAP_PROMPTS).join(', ')}`);
    }

    if (errors.length > 0) {
      console.error('[SpreadsheetGraph] Validation failed:', errors);
      return {
        ...state,
        status: 'error',
        finalOutput: `# Validation Error\n\n${errors.map(e => `- ${e}`).join('\n')}\n\nPlease fix these issues and try again.`,
      };
    }

    console.log('[SpreadsheetGraph] Validation passed');
    console.log(`  - Document IDs: ${state.documentIds?.length || 0}`);
    console.log(`  - Chunks: ${state.chunks?.length || 0}`);
    console.log(`  - Spreadsheet Type: ${state.spreadsheetType}`);
    console.log(`  - Custom Prompt: ${state.customPrompt ? 'Yes (' + state.customPrompt.length + ' chars)' : 'No'}`);

    return state;
  }

  // Conditional routing function - returns Send objects for fan-out or 'collapse' string
  routeToMap(state: OverallStateType): Send[] | 'collapse' {
    console.log('\n' + '='.repeat(80));
    console.log('[SpreadsheetGraph] ===== ROUTE TO MAP PHASE =====');
    console.log('='.repeat(80));

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'route_to_map',
      documentCount: state.documentIds?.length || 0,
      documentIds: state.documentIds || [],
      chunkCount: state.chunks?.length || 0,
      spreadsheetType: state.spreadsheetType,
    }, null, 2));

    if (state.chunks && state.chunks.length > 0) {
      console.log(`\n[SpreadsheetGraph] Chunk breakdown:`);
      state.chunks.forEach((chunk, idx) => {
        const preview = this.chunkHash(chunk);
        console.log(`  [${idx + 1}/${state.chunks!.length}] ${preview.substring(0, 150)}...`);
      });
      console.log('');
    }

    if (state.chunks.length === 0) {
      console.warn('[SpreadsheetGraph] No chunks to process, routing to collapse');
      return 'collapse';
    }

    const validatedChunks = validateChunks(state.chunks);
    const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE_TOKENS);

    console.log(`[SpreadsheetGraph] Creating ${packedChunks.length} parallel map tasks`);

    return packedChunks.map((chunk, idx) => {
      const preview = chunk.substring(0, 100).replace(/\n/g, ' ');
      console.log(`  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (${chunk.length} chars)`);
      return new Send('map_process', {
        chunk,
        chunkIndex: idx,
        totalChunks: packedChunks.length,
        spreadsheetType: state.spreadsheetType,
        customPrompt: state.customPrompt,
      });
    });
  }

  // Node: Map phase (runs in parallel via Send) - Extract text/summaries
  async mapProcess(state: ChunkProcessState): Promise<Partial<OverallStateType>> {
    const { chunk, chunkIndex, spreadsheetType, customPrompt } = state;
    const startTime = Date.now();

    const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : '[Chunk ?]';
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[SpreadsheetGraph] ===== MAP PROCESS PHASE ${chunkId} =====`);
    console.log('='.repeat(80));
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'map_process',
      chunkIndex: chunkIndex,
      chunkLength: chunk.length,
      chunkPreview: chunk.substring(0, 150).replace(/\n/g, ' '),
      spreadsheetType: spreadsheetType,
    }, null, 2));

    // Build prompt for text extraction (no structured output)
    // If customPrompt is provided (even for predefined types), use the custom template
    // Otherwise, use the predefined template for the spreadsheet type
    const promptTemplate = (customPrompt && customPrompt.trim()) 
      ? MAP_PROMPTS['custom']
      : (MAP_PROMPTS[spreadsheetType] || MAP_PROMPTS['custom']);
    const prompt = promptTemplate
      .replace('{chunk}', chunk)
      .replace('{customPrompt}', this.sanitizeUserInput(customPrompt || ''));

    console.log(`[SpreadsheetGraph] ${chunkId} Sending prompt to LLM (${prompt.length} chars)...`);

    let mapOutput: string;
    try {
      mapOutput = await invokeWithRetry<string>(
        () => invokeWithTimeout(
          () => (this.fastLlm as any).invoke([
            new SystemMessage(MAP_SYSTEM_PROMPT),
            new HumanMessage(prompt),
          ], createLangSmithRunConfig({
            runName: 'SpreadsheetGraph.MapProcess',
            tags: ['agent', 'spreadsheet', 'map'],
            metadata: {
              chunkIndex,
              spreadsheetType,
              chunkLength: chunk.length,
            },
          })),
          GRAPH_CONFIG.MAP_TIMEOUT_MS,
          'Map'
        ),
        {
          maxAttempts: PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
          baseDelayMs: PROCESSING_CONFIG.RETRY_BACKOFF_MS,
          onRetry: (attempt, error, delay) => {
            console.warn(
              `[SpreadsheetGraph] Map ${chunkId} attempt ${attempt}/${PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS} failed:`,
              error.message
            );
            console.log(`[SpreadsheetGraph] Retrying Map ${chunkId} in ${delay}ms...`);
          },
        },
        `Map ${chunkId}`
      );
      // Get the text content from the response
      mapOutput = this.getMessageContent(mapOutput);
    } catch (error) {
      const errorContext = {
        timestamp: new Date().toISOString(),
        chunkId,
        chunkLength: chunk.length,
        spreadsheetType,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        } : String(error),
      };
      console.error('[SpreadsheetGraph] Map process error:', JSON.stringify(errorContext, null, 2));
      throw error;
    }

    const elapsed = Date.now() - startTime;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'map_process_complete',
      chunkIndex: chunkIndex,
      outputLength: mapOutput.length,
      processingTimeMs: elapsed,
      outputPreview: mapOutput.substring(0, 300).replace(/\n/g, ' '),
    }, null, 2));

    console.log(`[SpreadsheetGraph] ${chunkId} Extracted ${mapOutput.length} chars of text data`);

    return {
      mapOutputs: [mapOutput], // Direct text output, no JSON
      progress: {
        phase: 'map_process',
        percentage: Math.min(10 + ((chunkIndex ?? 0) * 30), 60),
        message: `Chunk ${(chunkIndex ?? 0) + 1}/${state.totalChunks ?? '?'} complete`,
        chunksCompleted: (chunkIndex ?? 0) + 1,
        totalChunks: state.totalChunks,
      },
    };
  }

  // Node: Collapse phase - consolidate text outputs
  async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
    console.log(`\n${'='.repeat(80)}`);
    console.log('[SpreadsheetGraph] ===== COLLAPSE PHASE =====');
    console.log('='.repeat(80));

    const mapOutputsCount = state.mapOutputs.length;
    const mapOutputsDetails = state.mapOutputs.map((output, idx) => ({
      index: idx,
      length: output.length,
      preview: output.substring(0, 100).replace(/\n/g, ' '),
    }));

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'collapse',
      mapOutputsReceived: state.mapOutputs.length,
      mapOutputsDetails,
    }, null, 2));

    if (!state.mapOutputs || state.mapOutputs.length === 0) {
      console.error('[SpreadsheetGraph] Collapse: ERROR - No mapOutputs received!');
      return {
        ...state,
        collapsedOutputs: [],
        status: 'reducing',
      };
    }

    const totalTokens = state.mapOutputs.reduce(
      (sum, s) => sum + this.estimateTokens(s),
      0
    );

    console.log(`[SpreadsheetGraph] Collapse: total tokens ${totalTokens}`);

    const TARGET_TOKENS = GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS; // ~15000 tokens

    // If total tokens are already below target, skip collapse and go directly to reduce
    if (totalTokens <= TARGET_TOKENS) {
      console.log(`[SpreadsheetGraph] Collapse: skipping (${totalTokens} tokens <= ${TARGET_TOKENS} target), passing through to reduce`);
      return {
        ...state,
        collapsedOutputs: state.mapOutputs,
        status: 'reducing',
        progress: {
          phase: 'collapse',
          percentage: 70,
          message: `Skipped collapse (${totalTokens} tokens, already below ${TARGET_TOKENS} target)`,
        },
      };
    }

    // If we have few outputs, skip collapse and go directly to reduce
    if (state.mapOutputs.length <= 2) {
      console.log('[SpreadsheetGraph] Collapse: skipping (only 2 outputs), passing through to reduce');
      return {
        ...state,
        collapsedOutputs: state.mapOutputs,
        status: 'reducing',
        progress: {
          phase: 'collapse',
          percentage: 70,
          message: `Skipped collapse (${state.mapOutputs.length} outputs)`,
        },
      };
    }

    console.log('[SpreadsheetGraph] Collapse: performing recursive collapse');
    const collapsed = await this.recursiveCollapse(state.mapOutputs, state.spreadsheetType, state.customPrompt);

    // Calculate memory freed before clearing
    const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
    console.log(`[SpreadsheetGraph] Collapse: freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`);

    return {
      ...state,
      collapsedOutputs: collapsed,
      status: 'reducing',
      ...clearStateKeys<OverallStateType>(['mapOutputs']),
      progress: {
        phase: 'collapse',
        percentage: 70,
        message: `Collapsed ${state.mapOutputs.length} outputs into ${collapsed.length}`,
      },
    };
  }

  private async recursiveCollapse(textOutputs: string[], spreadsheetType: string, customPrompt?: string): Promise<string[]> {
    // Use packChunks-style token-based grouping
    const TARGET_TOKENS = GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS; // ~15000 tokens
    const MIN_TOKENS = TARGET_TOKENS * 0.3; // Don't create tiny groups

    if (textOutputs.length <= 2) {
      return textOutputs;
    }

    // Group by estimated tokens
    const groups: string[][] = [];
    let currentGroup: string[] = [];
    let currentTokens = 0;

    for (const output of textOutputs) {
      const outputTokens = this.estimateTokens(output);

      if (currentTokens + outputTokens > TARGET_TOKENS && currentGroup.length > 0) {
        groups.push([...currentGroup]);
        currentGroup = [output];
        currentTokens = outputTokens;
      } else {
        currentGroup.push(output);
        currentTokens += outputTokens;
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    console.log(`[SpreadsheetGraph] Collapsing ${groups.length} token-aware groups (target: ${TARGET_TOKENS} tokens each)`);

    const concurrency = parseInt(env.SPREADSHEET_COLLAPSE_CONCURRENCY || '5', 10);
    const collapsed = await allWithConcurrency(
      groups.map((group, idx) => {
        const totalTokens = group.reduce((sum, t) => sum + this.estimateTokens(t), 0);
        console.log(`[SpreadsheetGraph] Collapsing group ${idx + 1}/${groups.length} (${group.length} fragments, ~${totalTokens} tokens)`);
        return () => this.collapseGroup(group, spreadsheetType, customPrompt);
      }),
      concurrency
    );

    return this.recursiveCollapse(collapsed, spreadsheetType, customPrompt);
  }

  private async collapseGroup(group: string[], spreadsheetType: string, customPrompt?: string): Promise<string> {
    const combined = group.join('\n\n---\n\n');
    // If customPrompt is provided (even for predefined types), use the custom template
    // Otherwise, use the predefined template for the spreadsheet type
    const collapsePrompt = (customPrompt && customPrompt.trim())
      ? COLLAPSE_PROMPTS['custom']
      : (COLLAPSE_PROMPTS[spreadsheetType] || COLLAPSE_PROMPTS['custom']);

    const prompt = collapsePrompt
      .replace('{content}', combined)
      .replace('{customPrompt}', this.sanitizeUserInput(customPrompt || ''));

    const response = await invokeWithRetry(
      () => invokeWithTimeout(
        () => (this.smartLlm as any).invoke([
          new SystemMessage(COLLAPSE_SYSTEM_PROMPT),
          new HumanMessage(prompt),
        ], createLangSmithRunConfig({
          runName: 'SpreadsheetGraph.CollapseGroup',
          tags: ['agent', 'spreadsheet', 'collapse'],
          metadata: {
            fragmentCount: group.length,
          },
        })),
        GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
        'CollapseGroup'
      ),
      {
        maxAttempts: PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
        baseDelayMs: PROCESSING_CONFIG.RETRY_BACKOFF_MS,
        onRetry: (attempt, error, delay) => {
          console.warn(
            `[SpreadsheetGraph] CollapseGroup attempt ${attempt}/${PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS} failed:`,
            error.message
          );
          console.log(`[SpreadsheetGraph] Retrying CollapseGroup in ${delay}ms...`);
        },
      },
      'CollapseGroup'
    );

    return this.getMessageContent(response);
  }

  // Node: Reduce phase - generate CSV from consolidated text
  async reduce(state: OverallStateType): Promise<Partial<OverallStateType>> {
    console.log(`\n${'='.repeat(80)}`);
    console.log('[SpreadsheetGraph] ===== REDUCE PHASE (CSV GENERATION) =====');
    console.log('='.repeat(80));

    const collapsedOutputsCount = state.collapsedOutputs.length;
    const chunksCount = state.chunks?.length || 0;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'reduce',
      collapsedOutputsCount,
      spreadsheetType: state.spreadsheetType,
    }, null, 2));

    const combined = state.collapsedOutputs.join('\n\n---\n\n');

    console.log(`[SpreadsheetGraph] Reduce: combined content length: ${combined.length} chars`);

    // Get the reduce prompt based on spreadsheet type
    // If customPrompt is provided (even for predefined types), use the custom template
    // Otherwise, use the predefined template for the spreadsheet type
    const reducePrompt = (state.customPrompt && state.customPrompt.trim())
      ? REDUCE_PROMPTS['custom']
      : (REDUCE_PROMPTS[state.spreadsheetType] || REDUCE_PROMPTS['custom']);
    const prompt = reducePrompt
      .replace('{spreadsheetType}', state.spreadsheetType)
      .replace('{customPrompt}', this.sanitizeUserInput(state.customPrompt || ''))
      .replace('{content}', combined);

    console.log(`[SpreadsheetGraph] Reduce: prompt length: ${prompt.length} chars`);

    const startTime = Date.now();
    let finalOutput: string;

    try {
      const response = await invokeWithRetry(
        () => invokeWithTimeout(
          () => (this.smartLlm as any).invoke([
            new SystemMessage(REDUCE_SYSTEM_PROMPT),
            new HumanMessage(prompt),
          ], createLangSmithRunConfig({
            runName: 'SpreadsheetGraph.Reduce',
            tags: ['agent', 'spreadsheet', 'reduce'],
            metadata: {
              spreadsheetType: state.spreadsheetType,
              collapsedOutputsCount,
            },
          })),
          GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
          'Reduce'
        ),
        {
          maxAttempts: PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
          baseDelayMs: PROCESSING_CONFIG.RETRY_BACKOFF_MS,
          onRetry: (attempt, error, delay) => {
            console.warn(
              `[SpreadsheetGraph] Reduce attempt ${attempt}/${PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS} failed:`,
              error.message
            );
            console.log(`[SpreadsheetGraph] Retrying Reduce in ${delay}ms...`);
          },
        },
        'Reduce'
      );

      const responseAny = response as any;
      const metadata = responseAny.response_metadata || {};
      const finishReason = metadata.finish_reason || metadata.tokenUsage?.finish_reason;

      console.log('[SpreadsheetGraph] ===== RESPONSE ANALYSIS =====');
      console.log('[SpreadsheetGraph] Content length:', responseAny.content?.toString()?.length || 'N/A');
      console.log('[SpreadsheetGraph] Estimated tokens:', Math.ceil((responseAny.content?.toString()?.length || 0) / 3));
      console.log('[SpreadsheetGraph] Finish reason:', finishReason);
      console.log('[SpreadsheetGraph] Token usage:', JSON.stringify(metadata.token_usage || metadata));
      console.log('[SpreadsheetGraph] Last 200 chars:', (responseAny.content?.toString() || '').slice(-200));
      console.log('[SpreadsheetGraph] =====================================');

      // CLEAN THE OUTPUT - Remove markdown code blocks
      const rawContent = this.getMessageContent(response);
      finalOutput = this.cleanCsvOutput(rawContent);

      if (finishReason === 'length') {
        console.error('[SpreadsheetGraph] ⚠️ CSV TRUNCATED!');
        // For CSV, truncation is fatal for the last row. Remove incomplete row.
        const lastNewline = finalOutput.lastIndexOf('\n');
        if (lastNewline > 0) {
          const beforeTrim = finalOutput;
          finalOutput = finalOutput.substring(0, lastNewline);
          console.log(`[SpreadsheetGraph] Trimmed incomplete last row. Removed ${beforeTrim.length - finalOutput.length} chars.`);
        }
      }

      const validation = this.validateTableCompleteness(finalOutput, state.spreadsheetType);
      if (!validation.isComplete) {
        console.warn('[SpreadsheetGraph] CSV validation issues:', validation.missing);
        if (finishReason === 'length') {
          console.error('[SpreadsheetGraph] Confirmed: truncation likely caused incompleteness');
        }
      }
    } catch (error) {
      const errorContext = {
        timestamp: new Date().toISOString(),
        spreadsheetType: state.spreadsheetType,
        collapsedOutputsCount: state.collapsedOutputs.length,
        contentLength: combined.length,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        } : String(error),
      };
      console.error('[SpreadsheetGraph] Reduce phase error:', JSON.stringify(errorContext, null, 2));

      finalOutput = `Error,Could not generate CSV\nMessage,${error instanceof Error ? error.message : 'Unknown error'}\nType,${state.spreadsheetType}`;
    }

    const elapsed = Date.now() - startTime;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'reduce_complete',
      finalOutputLength: finalOutput.length,
      processingTimeMs: elapsed,
      outputPreview: finalOutput.substring(0, 200).replace(/\n/g, ' '),
    }, null, 2));

    console.log(`[SpreadsheetGraph] Reduce: final CSV output length: ${finalOutput.length} chars (took ${elapsed}ms)`);

    // Calculate memory to be freed
    const collapsedOutputsSize = state.collapsedOutputs.reduce((sum, s) => sum + s.length * 2, 0);
    const chunksSize = (state.chunks || []).reduce((sum, s) => sum + s.length * 2, 0);
    console.log(`[SpreadsheetGraph] Reduce: freeing ~${((collapsedOutputsSize + chunksSize) / 1024).toFixed(2)} KB from intermediate data`);

    return {
      ...state,
      finalOutput,
      status: 'completed',
      ...clearStateKeys<OverallStateType>(['collapsedOutputs', 'chunks']),
      progress: {
        phase: 'reduce',
        percentage: 100,
        message: 'Completed: CSV spreadsheet generated',
      },
    };
  }

  // Node: Merge final results
  private mergeResults(state: OverallStateType): Partial<OverallStateType> {
    console.log(`\n${'='.repeat(80)}`);
    console.log('[SpreadsheetGraph] ===== GENERATION COMPLETE =====');
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
        message: 'Spreadsheet generation complete',
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
   * Build the state graph for spreadsheet generation.
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

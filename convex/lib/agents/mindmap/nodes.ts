"use node"
/**
 * Node functions and main class for MindMapGraph.
 *
 * Contains all node logic for map_process and reduce_node phases,
 * along with the main MindMapGraph class.
 */

import { StateGraph, START, END, Send } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { SystemMessage, HumanMessage, BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { env } from '../../helpers/env';

// Shared utilities
import {
  invokeWithTimeout,
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
  validateWithPreset,
  logInfo,
  logWarn,
  logError,
  logPhaseStart,
  logBanner,
  countTokens,
  createLangSmithRunConfig,
} from '../shared/index.js';

// Import from local modules
import {
  OverallState,
  ChunkState,
  type OverallStateType,
  type ChunkStateType,
  type ConceptExtraction,
  type MindMapNode,
  type FinalMindMap,
} from './state.js';
import { MAP_PROMPT, REDUCE_PROMPT, NODES, MAP_SYSTEM_PROMPT, REDUCE_SYSTEM_PROMPT } from './prompts.js';

// ============================================================
// SCHEMAS
// ============================================================

const ConceptExtractionSchema = z.object({
  main_theme: z.string(),
  summary: z.string(),
  key_concepts: z.array(z.string()),
});

// ============================================================
// CONFIGURATION
// ============================================================

const GRAPH_CONFIG = (() => {
  return {
    OPTIMAL_CHUNK_SIZE_TOKENS: parseInt(env.MINDMAP_MAP_CHUNK_TOKENS || '3750', 10), // ~15K chars ≈ 3.75K tokens
    REDUCE_CHUNK_SIZE_TOKENS: parseInt(env.MINDMAP_REDUCE_CHUNK_TOKENS || '7500', 10), // ~30K chars ≈ 7.5K tokens
    MAX_CONCURRENT_CHUNKS: 10,
    MAP_TIMEOUT_MS: parseInt(env.MINDMAP_MAP_TIMEOUT_MS || '300000', 10),
    REDUCE_TIMEOUT_MS: parseInt(env.MINDMAP_REDUCE_TIMEOUT_MS || '300000', 10),
  } as const;
})();

// ============================================================
// CHUNK HELPERS
// ============================================================

/**
 * Wrapper around shared packChunks utility with MindMapGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.OPTIMAL_CHUNK_SIZE_TOKENS): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'MindMapGraph',
  });
}

/**
 * Wrapper around shared validateChunks utility with MindMapGraph logging.
 */
export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: GRAPH_CONFIG.OPTIMAL_CHUNK_SIZE_TOKENS,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'MindMapGraph',
  });
}

// ============================================================
// MIND MAP GRAPH CLASS
// ============================================================

/**
 * MindMapGraph class that orchestrates mind map generation.
 * This is the main class that users interact with.
 */
export class MindMapGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private failureCount = 0;
  private readonly MAX_TOTAL_FAILURES = 5;

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.1,
      maxTokens: 8000,
    });

    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.3,
      maxTokens: 16000,
    });
  }

  /**
   * Typed wrapper for concept extraction
   */
  private async extractConcepts(content: string): Promise<ConceptExtraction> {
    const structuredLlm = this.fastLlm.withStructuredOutput<ConceptExtraction>(
      ConceptExtractionSchema,
      { name: "concept_extraction" }
    );

    return await invokeWithTimeout(
      () => (structuredLlm as any).invoke([
        new SystemMessage(MAP_SYSTEM_PROMPT),
        new HumanMessage(MAP_PROMPT.replace('{content}', content))
      ], createLangSmithRunConfig({
        runName: 'MindMapGraph.MapProcess',
        tags: ['agent', 'mindmap', 'map'],
        metadata: {
          contentLength: content.length,
        },
      })),
      GRAPH_CONFIG.MAP_TIMEOUT_MS,
      'MindMapMap'
    );
  }

  // Map Node (Extraction)
  async mapProcess(state: ChunkStateType): Promise<Partial<OverallStateType> | Send> {
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

      const extraction = await this.extractConcepts(state.content || '');
      const elapsed = Date.now() - startTime;

      logInfo({
        agent: 'MindMapGraph',
        phase: 'map_process',
        conceptsExtracted: extraction.key_concepts.length,
        processingTimeMs: elapsed,
        mainTheme: extraction.main_theme,
      }, `Extracted ${extraction.key_concepts.length} concepts in ${elapsed}ms`);

      this.failureCount = 0;

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

      this.failureCount++;
      if (this.failureCount >= this.MAX_TOTAL_FAILURES) {
        logError({
          agent: 'MindMapGraph',
          phase: 'map_process',
          totalFailures: this.failureCount,
        }, `CIRCUIT BREAKER: ${this.failureCount} failures - stopping generation`);

        throw new Error(`Circuit breaker tripped: ${this.failureCount} chunks failed permanently`);
      }

      logError({
        agent: 'MindMapGraph',
        phase: 'map_process',
        attempts: retryCount + 1,
        totalFailures: this.failureCount,
      }, `Chunk failed permanently (${this.failureCount} total failures)`);
      return { extractedConcepts: [] };
    }
  }

  // Reduce Node (Markdown Strategy)
  async reduceNode(state: OverallStateType): Promise<Partial<OverallStateType>> {
    const extractions = state.extractedConcepts || [];

    logPhaseStart({
      agent: 'MindMapGraph',
      phase: 'reduce',
      extractionsCount: extractions.length,
    });

    if (extractions.length === 0) {
      logError({
        agent: 'MindMapGraph',
        phase: 'reduce',
      }, 'No extractions to build from!');
      return {
        finalOutput: { nodeData: { topic: 'Error: No Content', children: null } },
        status: 'failed',
        progress: {
          phase: 'reduce',
          percentage: 100,
          message: 'Failed: No content extracted',
        },
      };
    }

    const inputData = extractions.map(e =>
      `THEME: ${e.main_theme}\nSUMMARY: ${e.summary}\nCONCEPTS: ${e.key_concepts.join(", ")}`
    ).join("\n\n---\n\n");

    const safeInput = inputData.slice(0, 150000);

    logInfo({
      agent: 'MindMapGraph',
      phase: 'reduce',
      inputSize: inputData.length,
      truncatedSize: safeInput.length,
      model: (this.smartLlm as any).model,
    }, `Reducing ${extractions.length} extractions into map (${safeInput.length} chars)`);

    try {
      const start = Date.now();
      const response = await invokeWithTimeout(
        () => (this.smartLlm as any).invoke([
          new SystemMessage(REDUCE_SYSTEM_PROMPT),
          new HumanMessage(REDUCE_PROMPT.replace('{extractions}', safeInput))
        ], createLangSmithRunConfig({
          runName: 'MindMapGraph.Reduce',
          tags: ['agent', 'mindmap', 'reduce'],
          metadata: {
            extractionCount: extractions.length,
            inputSize: safeInput.length,
          },
        })),
        GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
        'MindMapReduce'
      );

      const markdown = ((response as BaseMessage).content[0] as { text?: string })?.text || String((response as BaseMessage).content);

      const validation = validateWithPreset(markdown, 'mindmap');
      if (!validation.isValid) {
        logWarn({
          agent: 'MindMapGraph',
          phase: 'reduce',
          validation: {
            isValid: validation.isValid,
            warnings: validation.warnings,
            score: validation.score,
          },
        }, `Mind map validation issues: ${validation.warnings.join(', ')}`);
      }

      const parsedTree = this.parseMarkdownToTree(markdown);
      const elapsed = Date.now() - start;

      logInfo({
        agent: 'MindMapGraph',
        phase: 'reduce',
        markdownLength: markdown.length,
        processingTimeMs: elapsed,
        rootTopic: parsedTree.topic,
        branchCount: parsedTree.children?.length ?? 0,
      }, `Final map generated in ${elapsed}ms`);

      if (parsedTree.children) {
        const branchTopics = parsedTree.children.map(c => c.topic).join(', ');
        logInfo({
          agent: 'MindMapGraph',
          phase: 'reduce',
          branchTopics,
        }, `Branch topics: ${branchTopics}`);
      }

      logBanner(
        {
          agent: 'MindMapGraph',
          phase: 'generation_complete',
          rootTopic: parsedTree.topic,
          branchCount: parsedTree.children?.length ?? 0,
          processingTimeMs: elapsed,
        },
        'MIND MAP GENERATION COMPLETE'
      );

      return {
        finalOutput: { nodeData: parsedTree },
        status: 'completed',
        progress: {
          phase: 'reduce',
          percentage: 100,
          message: `Completed: Mind map "${parsedTree.topic}" with ${parsedTree.children?.length ?? 0} branches`,
          conceptsExtracted: extractions.length,
        },
      };

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      logError({
        agent: 'MindMapGraph',
        phase: 'reduce',
        error: e instanceof Error ? {
          name: e.name,
          message: e.message,
          stack: e.stack?.split('\n').slice(0, 3).join('\n'),
        } : String(e),
      }, `Reduce Error: ${msg}. Using smart fallback...`);

      logInfo({
        agent: 'MindMapGraph',
        phase: 'reduce_fallback',
      }, 'Using smart fallback');

      const fallback = this.createSmartFallback(extractions);
      return {
        finalOutput: fallback,
        status: 'completed',
        progress: {
          phase: 'reduce',
          percentage: 100,
          message: `Completed: Mind map "${fallback.nodeData.topic}" (fallback mode)`,
          conceptsExtracted: extractions.length,
        },
      };
    }
  }

  // ============================================================
  // MARKDOWN PARSER
  // ============================================================

  /**
   * Parses markdown indentation into a JSON tree
   */
  parseMarkdownToTree(markdown: string): MindMapNode {
    const lines = markdown.split('\n').filter(l => l.trim().length > 0);
    let root: MindMapNode = { topic: "Knowledge Map", children: [] };

    const stack: { node: MindMapNode; level: number }[] = [];

    for (const rawLine of lines) {
      const line = rawLine.replace(/\t/g, '  ');

      if (line.trim().startsWith('#')) {
        const rootTopic = line.replace(/^#+\s*/, '').trim();
        root = { topic: rootTopic, children: [] };
        stack.length = 0;
        stack.push({ node: root, level: 0 });
        continue;
      }

      const bulletMatch = line.match(/^(\s*)(?:[-*]|\d+\.)\s+(.+)/);

      if (bulletMatch) {
        const indent = bulletMatch[1].length;
        const topic = bulletMatch[2].trim();

        const level = Math.floor(indent / 2) + 1;

        const newNode: MindMapNode = { topic, children: [] };

        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }

        if (stack.length === 0) {
          if (!root.children) root.children = [];
          root.children.push(newNode);
          stack.push({ node: newNode, level });
        } else {
          const parent = stack[stack.length - 1].node;
          if (!parent.children) parent.children = [];
          parent.children.push(newNode);
          stack.push({ node: newNode, level });
        }
      }
    }

    this.cleanLeafNodes(root);
    return root;
  }

  private cleanLeafNodes(node: MindMapNode): void {
    if (node.children && node.children.length === 0) {
      node.children = null;
    } else if (node.children) {
      node.children.forEach(c => this.cleanLeafNodes(c));
    }
  }

  // ============================================================
  // SMART FALLBACK
  // ============================================================

  /**
   * Creates a meaningful fallback tree
   */
  createSmartFallback(extractions: ConceptExtraction[]): FinalMindMap {
    const themeCounts: Record<string, number> = {};
    extractions.forEach(e => {
      const t = e.main_theme || "Unknown";
      themeCounts[t] = (themeCounts[t] || 0) + 1;
    });

    const rootTitle = Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "Knowledge Map";

    logInfo({
      agent: 'MindMapGraph',
      phase: 'fallback',
      rootTitle,
      themeCounts,
    }, `Fallback root: "${rootTitle}"`);

    const seenThemes = new Set<string>();
    const children: MindMapNode[] = [];

    for (const ex of extractions) {
      const theme = ex.main_theme || "Misc";
      if (seenThemes.has(theme)) continue;
      seenThemes.add(theme);

      const branchName = theme === rootTitle ? "Overview" : theme;

      children.push({
        topic: branchName,
        children: ex.key_concepts.map(c => ({
          topic: c,
          children: null
        }))
      });
    }

    logInfo({
      agent: 'MindMapGraph',
      phase: 'fallback',
      branchCount: children.length,
    }, `Fallback: ${children.length} branches`);

    return {
      nodeData: {
        topic: rootTitle,
        children: children.length > 0 ? children : null
      }
    };
  }

  // ============================================================
  // FAN-OUT LOGIC
  // ============================================================

  /**
   * Creates parallel map tasks from input chunks.
   */
  private createMapTasks(state: OverallStateType): Send[] {
    const validated = validateChunks(state.allChunks);

    if (validated.length === 0) {
      throw new Error('No valid chunks after validation');
    }

    const packed = packChunks(validated, GRAPH_CONFIG.OPTIMAL_CHUNK_SIZE_TOKENS);

    logInfo({
      agent: 'MindMapGraph',
      phase: 'fan_out',
      originalChunks: state.allChunks.length,
      packedChunks: packed.length,
    }, `Fanning out to ${packed.length} map nodes`);

    return packed.map((chunk, idx) =>
      new Send(NODES.MAP_PROCESS, {
        content: chunk,
        retryCount: 0,
        chunkIndex: idx,
        totalChunks: packed.length,
      })
    );
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  /**
   * Public API method with input validation.
   */
  async generate(chunks: string[]): Promise<FinalMindMap> {
    if (!chunks || chunks.length === 0) {
      throw new Error('No chunks provided for mind map generation');
    }

    const validated = validateChunks(chunks);
    if (validated.length === 0) {
      throw new Error('All chunks failed validation (empty or too small)');
    }

    logInfo({
      agent: 'MindMapGraph',
      phase: 'initialize',
      inputChunks: chunks.length,
      validChunks: validated.length,
    }, `Starting mind map generation with ${validated.length} valid chunks`);

    this.failureCount = 0;

    const graph = this.buildGraph();

    try {
      const result = await graph.invoke({
        allChunks: chunks,
        status: 'generating',
      });

      if (!result.finalOutput) {
        throw new Error('Graph execution completed but no output generated');
      }

      return result.finalOutput;
    } catch (error) {
      logError({
        agent: 'MindMapGraph',
        phase: 'generate',
        error: error instanceof Error ? error.message : String(error),
      }, `Mind map generation failed: ${error}`);

      throw error;
    }
  }

  // ============================================================
  // GRAPH BUILDER
  // ============================================================

  /**
   * Build Graph - using correct LangGraph map-reduce pattern.
   */
  buildGraph() {
    const builder = new StateGraph(OverallState);

    builder.addNode(NODES.MAP_PROCESS, (s: ChunkStateType) => this.mapProcess(s));
    builder.addNode(NODES.REDUCE_NODE, (s: OverallStateType) => this.reduceNode(s));

    builder.addConditionalEdges(START, this.createMapTasks.bind(this));

    builder.addEdge(NODES.MAP_PROCESS as any, NODES.REDUCE_NODE as any);
    builder.addEdge(NODES.REDUCE_NODE as any, END);

    return builder.compile();
  }
}

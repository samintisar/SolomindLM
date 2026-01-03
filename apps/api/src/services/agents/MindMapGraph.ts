import { StateGraph, START, END, Send, Annotation } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
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
} from './shared/index.js';

// ============================================================
// CONFIGURATION
// ============================================================

const GRAPH_CONFIG = {
  // 15k chars (~3.75k tokens) for map phase - configurable via env
  OPTIMAL_CHUNK_SIZE: parseInt(env.MINDMAP_MAP_CHUNK_SIZE || '15000', 10),
  // 30k chars for reduce phase aggregation
  REDUCE_CHUNK_SIZE: parseInt(env.MINDMAP_REDUCE_CHUNK_SIZE || '30000', 10),
  // High concurrency is fine with smaller chunks
  MAX_CONCURRENT_CHUNKS: 10,
  // Give ample time for slow provider responses to avoid wasteful retries
  MAP_TIMEOUT_MS: 120000, // 2 minutes
  REDUCE_TIMEOUT_MS: 180000, // 3 minutes
} as const;

// ============================================================
// SCHEMAS
// ============================================================

const ConceptExtractionSchema = z.object({
  main_theme: z.string(),
  summary: z.string(),
  key_concepts: z.array(z.string()),
});

export interface ConceptExtraction {
  main_theme: string;
  summary: string;
  key_concepts: string[];
}

export interface MindMapNode {
  topic: string;
  children: MindMapNode[] | null;
}

export interface FinalMindMap {
  nodeData: MindMapNode;
}

// ============================================================
// STATE DEFINITIONS
// ============================================================

const ChunkState = Annotation.Root({
  content: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => '' }),
  retryCount: Annotation<number>({ reducer: (x, y) => y ?? x, default: () => 0 }),
});

const OverallState = Annotation.Root({
  allChunks: Annotation<string[]>({ reducer: (x, y) => y ?? x, default: () => [] }),
  extractedConcepts: Annotation<ConceptExtraction[]>({
    reducer: (x, y) => [...x, ...(y ?? [])],
    default: () => []
  }),
  finalOutput: Annotation<any>({ reducer: (x, y) => y ?? x, default: () => null }),
  status: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => 'generating' }),
});

export type OverallStateType = typeof OverallState.State;
export type ChunkStateType = typeof ChunkState.State;

// ============================================================
// PROMPTS
// ============================================================

const MAP_PROMPT = `You are a Research Assistant.
Analyze the text and extract raw information.

OUTPUT REQUIREMENTS:
1. **Main Theme:** The specific subject of this text chunk.
2. **Summary:** 2-3 sentence high-level summary.
3. **Key Concepts:** 10-20 specific terms, people, events, or ideas defined here.

Input:
{content}`;

const REDUCE_PROMPT = `You are a Mind Map Architect.
Analyze the extracted data and create a deep, hierarchical mind map.

OUTPUT FORMAT:
- Use Markdown bullet points (* or -).
- Indentation determines depth (2 spaces per level).
- The first line must be the Root Topic prefixed with # (e.g., "# Roman Empire").

RULES:
1. Create ONE Root Topic that encompasses all themes.
2. Create 4-7 Main Branches (Level 1) as high-level categories.
3. Nest sub-topics 3-5 levels deep using indentation.
4. Group related concepts logically under meaningful category names.
5. Use specific, descriptive topic names (not "Aspect 1", "Category 2", etc.).

EXAMPLE STRUCTURE:
# The Roman Empire
* Political Structure
  * The Emperor
    * Powers and authority
    * Succession mechanisms
  * The Senate
    * Advisory role
    * Legislative functions
* Military System
  * Legion organization
    * Centuries and cohorts
    * Legion commanders
  * Provincial defenses
* Society and Culture
  * Social classes
    * Patricians
    * Plebeians
    * Slaves
  * Daily life
    * Entertainment
    * Religion

DATA (Themes and Concepts from documents):
{extractions}

Generate the mind map now.`;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Wrapper around shared packChunks utility with MindMapGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.OPTIMAL_CHUNK_SIZE): string[] {
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
    targetSize: GRAPH_CONFIG.OPTIMAL_CHUNK_SIZE,
    minChunkLength: 50,
    maxChunkLength: 50000,
    agentName: 'MindMapGraph',
  });
}

// ============================================================
// MAIN CLASS
// ============================================================

export class MindMapGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    // Fast model for extraction
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel || "meta-llama/Llama-3.2-3B-Instruct-Turbo",
      temperature: 0.1,
      maxTokens: 4000,
    });

    // Smart model for markdown generation
    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel || "Qwen/Qwen2.5-72B-Instruct-Turbo",
      temperature: 0.3,
      maxTokens: 16000,
    });
  }

  // 1. Fan Out
  routeInput(state: OverallStateType): Send[] {
    const validated = validateChunks(state.allChunks);
    const packed = packChunks(validated, GRAPH_CONFIG.OPTIMAL_CHUNK_SIZE);

    logInfo({
      agent: 'MindMapGraph',
      phase: 'route_input',
      originalChunks: state.allChunks.length,
      validatedChunks: validated.length,
      packedChunks: packed.length,
      maxConcurrency: GRAPH_CONFIG.MAX_CONCURRENT_CHUNKS,
    }, `Fanning out: ${packed.length} packed chunks (Original: ${state.allChunks.length})`);

    return packed.map(chunk => new Send("map_process", {
      content: chunk,
      retryCount: 0
    }));
  }

  // 2. Map Node (Extraction with smart retry logic)
  async mapProcess(state: ChunkStateType): Promise<Partial<OverallStateType> | Send> {
    const chunkLength = state.content?.length || 0;
    const retryCount = state.retryCount ?? 0;

    // Structured logging start
    logInfo({
      agent: 'MindMapGraph',
      phase: 'map_process',
      chunkLength,
      attempt: retryCount + 1,
    }, `Processing chunk (${chunkLength} chars) [Attempt ${retryCount + 1}/3]`);

    // @ts-ignore
    const parser = this.fastLlm.withStructuredOutput(ConceptExtractionSchema);

    const startTime = Date.now();

    try {
      // Add jitter to prevent thundering herd
      if (retryCount === 0) {
        await new Promise(r => setTimeout(r, Math.random() * 2000));
      }

      // Use shared timeout and retry utilities
      const response = await invokeWithTimeout(
        () => invokeWithRetry(
          () => parser.invoke([
            new SystemMessage('Extract main theme, 2–3 sentence summary, and 10–20 key concepts.'),
            new HumanMessage(MAP_PROMPT.replace('{content}', state.content || ''))
          ]),
          {
            maxAttempts: 3 - retryCount,
            baseDelayMs: 1000,
            retryableErrors: (error) => {
              const msg = error instanceof Error ? error.message.toLowerCase() : String(error);
              return msg.includes('timeout') || msg.includes('500') || msg.includes('503') || msg.includes('internal server error');
            },
            onRetry: (attempt, error) => {
              logWarn({
                agent: 'MindMapGraph',
                phase: 'map_process',
                attempt,
                error: error.message,
              }, `Retry attempt ${attempt}/3`);
            }
          },
          'MindMapMap'
        ),
        GRAPH_CONFIG.MAP_TIMEOUT_MS,
        'MindMapMap'
      );

      const extraction = response as ConceptExtraction;
      const elapsed = Date.now() - startTime;

      logInfo({
        agent: 'MindMapGraph',
        phase: 'map_process',
        conceptsExtracted: extraction.key_concepts.length,
        processingTimeMs: elapsed,
        mainTheme: extraction.main_theme,
      }, `Extracted ${extraction.key_concepts.length} concepts in ${elapsed}ms`);

      return { extractedConcepts: [extraction] };

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

      // Only retry on timeouts and server errors (500, 503). Fail fast on client errors.
      const isTimeout = msg.toLowerCase().includes('timeout');
      const isServerErr = msg.includes('500') || msg.includes('503') || msg.includes('internal server error');

      if ((isTimeout || isServerErr) && retryCount < 2) {
        logWarn({
          agent: 'MindMapGraph',
          phase: 'map_process',
          retryAttempt: retryCount + 1,
        }, `Retrying chunk (${retryCount + 1}/2)...`);
        return new Send('map_process', {
          content: state.content,
          retryCount: retryCount + 1,
        });
      }

      logError({
        agent: 'MindMapGraph',
        phase: 'map_process',
        attempts: retryCount + 1,
      }, `Chunk failed permanently after ${retryCount + 1} attempts`);
      return { extractedConcepts: [] };
    }
  }

  // 3. Reduce Node (Markdown Strategy)
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
      };
    }

    // Prepare text input
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
        () => this.smartLlm.invoke([
          new SystemMessage('You are a Mind Map Architect. Create hierarchical markdown outlines.'),
          new HumanMessage(REDUCE_PROMPT.replace('{extractions}', safeInput))
        ]),
        GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
        'MindMapReduce'
      );

      const markdown = (response.content[0] as any)?.text || String(response.content);

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

      return { finalOutput: { nodeData: parsedTree }, status: 'completed' };

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

      return {
        finalOutput: this.createSmartFallback(extractions),
        status: 'completed',
      };
    }
  }

  // ============================================================
  // MARKDOWN PARSER
  // ============================================================

  /**
   * Parses markdown indentation into a JSON tree
   * Supports:
   * - # Root headers
   * - *, -, or 1. for bullets
   * - 2-space or 4-space indentation
   */
  parseMarkdownToTree(markdown: string): MindMapNode {
    const lines = markdown.split('\n').filter(l => l.trim().length > 0);
    let root: MindMapNode = { topic: "Knowledge Map", children: [] };

    const stack: { node: MindMapNode; level: number }[] = [];

    for (const rawLine of lines) {
      const line = rawLine.replace(/\t/g, '  '); // Normalize tabs to spaces

      // Detect Root (# Title or ## Title)
      if (line.trim().startsWith('#')) {
        const rootTopic = line.replace(/^#+\s*/, '').trim();
        root = { topic: rootTopic, children: [] };
        stack.length = 0;
        stack.push({ node: root, level: 0 });
        continue;
      }

      // Detect bullet points: *, -, or 1.
      const bulletMatch = line.match(/^(\s*)(?:[-*]|\d+\.)\s+(.+)/);

      if (bulletMatch) {
        const indent = bulletMatch[1].length;
        const topic = bulletMatch[2].trim();

        // Calculate level (2 spaces per level)
        const level = Math.floor(indent / 2) + 1;

        const newNode: MindMapNode = { topic, children: [] };

        // Find parent by popping stack until we find a node at a higher level
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }

        if (stack.length === 0) {
          // Shouldn't happen if there's a root, but handle gracefully
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

    // Cleanup: convert empty children arrays to null for leaf nodes
    this.cleanLeafNodes(root);
    return root;
  }

  cleanLeafNodes(node: MindMapNode): void {
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
   * Creates a meaningful fallback tree by:
   * 1. Finding the most common theme for the root title
   * 2. Grouping concepts by theme
   * 3. No fake "Aspect" buckets
   */
  createSmartFallback(extractions: ConceptExtraction[]): FinalMindMap {
    // Find most common theme for Root Title
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

    // Deduplicate themes and build tree
    const seenThemes = new Set<string>();
    const children: MindMapNode[] = [];

    for (const ex of extractions) {
      const theme = ex.main_theme || "Misc";
      if (seenThemes.has(theme)) continue;
      seenThemes.add(theme);

      // Use a different name if theme matches root to avoid duplication
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

  // 4. Build Graph
  buildGraph() {
    const builder = new StateGraph(OverallState);

    builder.addNode('map_process', (s: ChunkStateType) => this.mapProcess(s));
    builder.addNode('reduce_node', (s: OverallStateType) => this.reduceNode(s));

    // Immediate Fan Out
    builder.addConditionalEdges(
      START,
      (s: OverallStateType) => this.routeInput(s),
      { map_process: 'map_process' } as any
    );

    // map_process -> reduce_node -> END
    builder.addEdge('map_process' as any, 'reduce_node' as any);
    builder.addEdge('reduce_node' as any, END as any);

    return builder.compile();
  }
}

import { StateGraph, START, END, Send, Annotation } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { env } from '../../config/env.js';

// Shared utilities for production-level patterns
import {
  invokeWithTimeout,
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
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

// Validate once at initialization to avoid repeated validation
const GRAPH_CONFIG = (() => {
  return {
    // 15k chars (~3.75k tokens) for map phase - configurable via env
    OPTIMAL_CHUNK_SIZE: parseInt(env.MINDMAP_MAP_CHUNK_SIZE || '15000', 10),
    // 30k chars for reduce phase aggregation
    REDUCE_CHUNK_SIZE: parseInt(env.MINDMAP_REDUCE_CHUNK_SIZE || '30000', 10),
    // High concurrency is fine with smaller chunks
    MAX_CONCURRENT_CHUNKS: 10,
    // Give ample time for slow provider responses to avoid wasteful retries
    MAP_TIMEOUT_MS: parseInt(env.MINDMAP_MAP_TIMEOUT_MS || '300000', 10),
    REDUCE_TIMEOUT_MS: parseInt(env.MINDMAP_REDUCE_TIMEOUT_MS || '300000', 10),
  } as const;
})();

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
  chunkIndex: Annotation<number>({ reducer: (x, y) => y ?? x, default: () => 0 }),
  totalChunks: Annotation<number>({ reducer: (x, y) => y ?? x, default: () => 0 }),
});

const OverallState = Annotation.Root({
  allChunks: Annotation<string[]>({ reducer: (x, y) => y ?? x, default: () => [] }),
  extractedConcepts: Annotation<ConceptExtraction[]>({
    reducer: (existing, incoming) => {
      const combined = [...existing, ...(incoming ?? [])];

      // Improved deduplication using full theme + summary for better accuracy
      const seen = new Set<string>();
      return combined.filter(item => {
        // Use full summary instead of truncated hash
        const key = `${item.main_theme}|${item.summary}`;

        if (seen.has(key)) {
          logInfo({
            agent: 'MindMapGraph',
            phase: 'deduplication',
            theme: item.main_theme,
          }, `Skipping duplicate extraction: ${item.main_theme}`);
          return false;
        }

        seen.add(key);
        return true;
      });
    },
    default: () => []
  }),
  finalOutput: Annotation<any>({ reducer: (x, y) => y ?? x, default: () => null }),
  status: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => 'generating' }),
  // Progress tracking for streaming
  progress: Annotation<{
    phase: string;
    percentage: number;
    message: string;
    chunksCompleted?: number;
    totalChunks?: number;
    conceptsExtracted?: number;
  }>({
    reducer: (_x, y?: any) => y ?? _x,
    default: () => ({ phase: 'initializing', percentage: 0, message: 'Initializing...' }),
  }),
});

export type OverallStateType = typeof OverallState.State;
export type ChunkStateType = typeof ChunkState.State;

// ============================================================
// PROMPTS
// ============================================================

const MAP_PROMPT = `You are a Research Assistant analyzing document chunks.

Extract EXACTLY this structure:
1. **Main Theme:** Single sentence identifying the core subject (max 15 words)
2. **Summary:** 2-3 sentences covering key points (50-100 words)
3. **Key Concepts:** Exactly 15 distinct concepts as bullet points
   - Prioritize: Technical terms, named entities, core ideas
   - Format: "Concept name: brief context (5-10 words)"
   - Avoid: Generic terms, duplicates, overly broad categories

Input chunk:
{content}`;

const REDUCE_PROMPT = `You are a Mind Map Architect.
Analyze the extracted data and create a deep, hierarchical mind map.

OUTPUT FORMAT:
- Use Markdown bullet points (* or -).
- Indentation determines depth (2 spaces per level).
- The first line must be the Root Topic prefixed with # (e.g., "# Roman Empire").

MANDATORY STRUCTURE:
- Level 0 (Root): # Single overarching topic
- Level 1: 4-7 main branches (* with 2-space indent)
- Level 2: 3-5 sub-topics per branch (4-space indent)
- Level 3-4: Granular concepts (6-8 space indent)

VALIDATION:
- Minimum 4 levels deep for at least 2 branches
- No generic labels like "Overview", "Introduction", "Conclusion", "Aspect", "Category"
- Each terminal node must be a specific concept, not a category

EXAMPLE:
# Machine Learning in Healthcare
* Clinical Applications
  * Diagnostic Systems
    * Medical imaging analysis
      * CT scan interpretation
      * MRI anomaly detection
    * Disease prediction models
      * Early warning systems
      * Risk stratification
* Data Processing
  * Feature engineering
    * Signal processing
    * Image normalization
  * Model training
    * Supervised learning
      * Classification algorithms
      * Regression analysis

DATA (Themes and Concepts from documents):
{extractions}

Generate the mind map now.`;

// ============================================================
// NODE NAMES
// ============================================================

const NODES = {
  MAP_PROCESS: 'map_process',
  REDUCE_NODE: 'reduce_node',
} as const;

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
  // Circuit breaker: track total permanent failures across all chunks
  private failureCount = 0;
  private readonly MAX_TOTAL_FAILURES = 5; // Trip after 5 permanent failures

  constructor(apiKey: string, mapModel: string, reduceModel: string) {
    // Fast model for extraction (using env.FAST_LLM from service)
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.1,
      maxTokens: 8000, // Increased from 4000 for better output
    });

    // Smart model for markdown generation
    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.3,
      maxTokens: 16000,
    });
  }

  /**
   * Typed wrapper for concept extraction to avoid @ts-expect-error
   */
  private async extractConcepts(content: string): Promise<ConceptExtraction> {
    const structuredLlm = this.fastLlm.withStructuredOutput<ConceptExtraction>(
      ConceptExtractionSchema,
      { name: "concept_extraction" }
    );

    return await invokeWithTimeout(
      () => structuredLlm.invoke([
        new SystemMessage('Extract main theme, 2–3 sentence summary, and 10–20 key concepts.'),
        new HumanMessage(MAP_PROMPT.replace('{content}', content))
      ]),
      GRAPH_CONFIG.MAP_TIMEOUT_MS,
      'MindMapMap'
    );
  }

  // Map Node (Extraction - simplified without manual retry)
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

    const startTime = Date.now();

    try {
      // Add jitter only on retries to prevent thundering herd
      // Use exponential backoff with jitter for retries
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
        // Small jitter on first attempt to prevent synchronized starts
        await new Promise(r => setTimeout(r, Math.random() * 500));
      }

      // Use typed extraction method
      const extraction = await this.extractConcepts(state.content || '');
      const elapsed = Date.now() - startTime;

      logInfo({
        agent: 'MindMapGraph',
        phase: 'map_process',
        conceptsExtracted: extraction.key_concepts.length,
        processingTimeMs: elapsed,
        mainTheme: extraction.main_theme,
      }, `Extracted ${extraction.key_concepts.length} concepts in ${elapsed}ms`);

      // Reset failure count on success
      this.failureCount = 0;

      // Return concepts - LangGraph handles aggregation automatically
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

      // Only retry on timeouts and server errors (500, 503). Fail fast on client errors.
      const isTimeout = msg.toLowerCase().includes('timeout');
      const isServerErr = msg.includes('500') || msg.includes('503') || msg.includes('internal server error');

      // Simplified retry: max 3 attempts total (no nested retries)
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

      // Circuit breaker: increment failure count and check if we should stop
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
        progress: {
          phase: 'reduce',
          percentage: 100,
          message: 'Failed: No content extracted',
        },
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

  // ============================================================
  // FAN-OUT LOGIC
  // ============================================================

  /**
   * Creates parallel map tasks from input chunks.
   * Separated for cleaner graph structure and reusability.
   */
  private createMapTasks(state: OverallStateType): Send[] {
    // Validate and pack chunks
    const validated = validateChunks(state.allChunks);

    if (validated.length === 0) {
      throw new Error('No valid chunks after validation');
    }

    const packed = packChunks(validated, GRAPH_CONFIG.OPTIMAL_CHUNK_SIZE);

    logInfo({
      agent: 'MindMapGraph',
      phase: 'fan_out',
      originalChunks: state.allChunks.length,
      packedChunks: packed.length,
    }, `Fanning out to ${packed.length} map nodes`);

    // Return Send array - LangGraph parallelizes automatically
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
   * Main entry point for mind map generation.
   */
  async generate(chunks: string[]): Promise<FinalMindMap> {
    // Pre-flight validation
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

    // Reset circuit breaker
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
   * LangGraph automatically handles fan-in synchronization via reducers.
   */
  buildGraph() {
    const builder = new StateGraph(OverallState);

    // Only 2 nodes needed for map-reduce pattern
    builder.addNode(NODES.MAP_PROCESS, (s: ChunkStateType) => this.mapProcess(s));
    builder.addNode(NODES.REDUCE_NODE, (s: OverallStateType) => this.reduceNode(s));

    // Fan out from START using conditional edges that return Send objects
    // LangGraph automatically parallelizes all Send objects to the same target
    builder.addConditionalEdges(START, this.createMapTasks.bind(this));

    // Automatic fan-in: LangGraph waits for ALL map_process nodes to complete
    // then aggregates via the reducer, then proceeds to reduce_node
    builder.addEdge(NODES.MAP_PROCESS as any, NODES.REDUCE_NODE as any);
    builder.addEdge(NODES.REDUCE_NODE as any, END);

    return builder.compile();
  }
}

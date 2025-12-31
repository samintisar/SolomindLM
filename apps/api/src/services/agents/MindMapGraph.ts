import { StateGraph, START, END, Send, Annotation } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { env } from '../../config/env.js';

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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
  });
  return Promise.race([promise.finally(() => clearTimeout(timer!)), timeoutPromise]);
}

export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.OPTIMAL_CHUNK_SIZE): string[] {
  if (!chunks || chunks.length === 0) return [];

  console.log(`\n[MindMapGraph] ===== CHUNK PACKING =====`);
  console.log(`[MindMapGraph] Original chunks: ${chunks.length}`);
  console.log(`[MindMapGraph] Target size: ${targetSize} chars per packed chunk`);

  const packed: string[] = [];
  const buffer: string[] = [];
  let bufferSize = 0;

  for (const chunk of chunks) {
    if (!chunk?.trim()) continue;

    const chunkSize = chunk.length + (buffer.length > 0 ? 2 : 0);

    if (bufferSize + chunkSize > targetSize && buffer.length > 0) {
      packed.push(buffer.join('\n\n'));
      buffer.length = 0;
      bufferSize = 0;
    }

    buffer.push(chunk);
    bufferSize += chunkSize;
  }

  if (buffer.length > 0) {
    packed.push(buffer.join('\n\n'));
  }

  const totalOriginalChars = chunks.join('').length;
  const totalPackedChars = packed.join('').length;
  const reduction = Math.round((1 - packed.length / chunks.length) * 100);

  console.log(`[MindMapGraph] Packed into: ${packed.length} chunks`);
  console.log(`[MindMapGraph] Original: ${totalOriginalChars} chars → Packed: ${totalPackedChars} chars`);
  console.log(`[MindMapGraph] Reduction: ${chunks.length} → ${packed.length} (${reduction}% fewer API calls)`);

  return packed;
}

export function validateChunks(chunks: string[]): string[] {
  if (!chunks || chunks.length === 0) return [];

  console.log(`\n[MindMapGraph] ===== INPUT VALIDATION =====`);
  console.log(`[MindMapGraph] Input chunks: ${chunks.length}`);

  const validated = chunks
    .filter(c => c && typeof c === 'string')
    .map(c => c.slice(0, 50000))
    .filter(c => c.trim().length > 50);

  const filteredOut = chunks.length - validated.length;
  console.log(`[MindMapGraph] Valid chunks: ${validated.length}`);
  console.log(`[MindMapGraph] Filtered out: ${filteredOut} (too short or invalid)`);

  return validated;
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

    console.log(`\n[MindMapGraph] 🚀 FANNING OUT: ${packed.length} packed chunks (Original: ${state.allChunks.length})`);
    console.log(`[MindMapGraph] Max concurrency: ${GRAPH_CONFIG.MAX_CONCURRENT_CHUNKS}`);

    return packed.map(chunk => new Send("map_process", {
      content: chunk,
      retryCount: 0
    }));
  }

  // 2. Map Node (Extraction with smart retry logic)
  async mapProcess(state: ChunkStateType): Promise<Partial<OverallStateType> | Send> {
    const chunkLength = state.content?.length || 0;
    const retryCount = state.retryCount ?? 0;

    console.log(`[MindMapGraph] → Processing chunk (${chunkLength} chars) [Attempt ${retryCount + 1}/3]`);

    // @ts-ignore
    const parser = this.fastLlm.withStructuredOutput(ConceptExtractionSchema);

    const startTime = Date.now();

    try {
      // Add jitter to prevent thundering herd
      if (retryCount === 0) {
        await new Promise(r => setTimeout(r, Math.random() * 2000));
      }

      const response = await withTimeout(
        parser.invoke([
          new SystemMessage('Extract main theme, 2–3 sentence summary, and 10–20 key concepts.'),
          new HumanMessage(MAP_PROMPT.replace('{content}', state.content || ''))
        ]),
        GRAPH_CONFIG.MAP_TIMEOUT_MS,
        'Map Timeout'
      );

      const extraction = response as ConceptExtraction;
      const elapsed = Date.now() - startTime;

      console.log(`[MindMapGraph]   ✅ Extracted ${extraction.key_concepts.length} concepts in ${elapsed}ms`);
      console.log(`[MindMapGraph]   main_theme: "${extraction.main_theme}"`);

      return { extractedConcepts: [extraction] };

    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[MindMapGraph]   ⚠️ Chunk failed: ${msg}`);

      // Only retry on timeouts and server errors (500, 503). Fail fast on client errors.
      const isTimeout = msg.toLowerCase().includes('timeout');
      const isServerErr = msg.includes('500') || msg.includes('503') || msg.includes('internal server error');

      if ((isTimeout || isServerErr) && retryCount < 2) {
        console.log(`[MindMapGraph]   ↺ Retrying chunk (${retryCount + 1}/2)...`);
        return new Send('map_process', {
          content: state.content,
          retryCount: retryCount + 1,
        });
      }

      console.error(`[MindMapGraph]   ❌ Chunk failed permanently after ${retryCount + 1} attempts`);
      return { extractedConcepts: [] };
    }
  }

  // 3. Reduce Node (Markdown Strategy)
  async reduceNode(state: OverallStateType): Promise<Partial<OverallStateType>> {
    const extractions = state.extractedConcepts || [];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[MindMapGraph] ===== REDUCE PHASE =====`);
    console.log(`[MindMapGraph] 🧩 Reducing ${extractions.length} extractions into map...`);

    if (extractions.length === 0) {
      console.error('[MindMapGraph] ✗ No extractions to build from!');
      return {
        finalOutput: { nodeData: { topic: 'Error: No Content', children: null } },
        status: 'failed',
      };
    }

    // Prepare text input
    const inputData = extractions.map(e =>
      `THEME: ${e.main_theme}\nSUMMARY: ${e.summary}\nCONCEPTS: ${e.key_concepts.join(", ")}`
    ).join("\n\n---\n\n");

    console.log(`[MindMapGraph] Input size: ${inputData.length} chars`);
    const safeInput = inputData.slice(0, 150000);

    console.log(`[MindMapGraph] Model: ${(this.smartLlm as any).model}`);
    console.log(`[MindMapGraph] Starting markdown generation at ${new Date().toISOString()}`);

    try {
      const start = Date.now();
      const response = await withTimeout(
        this.smartLlm.invoke([
          new SystemMessage('You are a Mind Map Architect. Create hierarchical markdown outlines.'),
          new HumanMessage(REDUCE_PROMPT.replace('{extractions}', safeInput))
        ]),
        GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
        'Reduce Timeout'
      );

      const markdown = (response.content[0] as any)?.text || String(response.content);
      console.log(`[MindMapGraph] Generated ${markdown.length} chars of markdown`);

      const parsedTree = this.parseMarkdownToTree(markdown);
      const elapsed = Date.now() - start;

      console.log(`[MindMapGraph] ✓ Final map generated in ${elapsed}ms`);
      console.log(`[MindMapGraph]   Root topic: "${parsedTree.topic}"`);
      console.log(`[MindMapGraph]   Branches: ${parsedTree.children?.length ?? 0}`);

      if (parsedTree.children) {
        const branchTopics = parsedTree.children.map(c => c.topic).join(', ');
        console.log(`[MindMapGraph]   Branch topics: ${branchTopics}`);
      }

      return { finalOutput: { nodeData: parsedTree }, status: 'completed' };

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[MindMapGraph] ✗ Reduce Error: ${msg}`);
      console.error(`[MindMapGraph] Using smart fallback...`);

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

    console.log(`[MindMapGraph] Fallback root: "${rootTitle}"`);

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

    console.log(`[MindMapGraph] Fallback: ${children.length} branches`);

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

"use node"
/**
 * Chat Agent Service
 *
 * Orchestrates chat responses using a constrained tool-calling loop:
 * 1. LLM decides what to search for (search_documents / ask_clarification tools)
 * 2. HyDE embedding improves retrieval quality
 * 3. Structured generation with citations
 * 4. Grounding validation with one retry on failure
 * 5. Follow-up question generation
 */

import { env } from '../_lib/env';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';

import { VectorSearchHandler } from './chat/vector_search.js';
import { ChatLLMWrapper, type ChatResponse } from './chat/llm_wrapper.js';
import { validateGrounding, validateSemanticGrounding } from './chat/grounding_validator.js';
import { EmbeddingService } from '../_services/processing/EmbeddingServiceClient';
import type { ReferenceChunk } from '../storage/ChatHistoryService';

// ============================================================
// Types
// ============================================================

export interface ChatAgentContext {
  userId: string;
  noteId: string;
  conversationHistory: Array<{ role: string; content: string }>;
  documentIds?: string[];
}

export interface StreamChunk {
  type: 'token' | 'references' | 'done' | 'error' | 'warning' | 'grounding_check' | 'status' | 'tool_call' | 'followups' | 'clarification';
  data?: any;
  status?: string;
  message?: string;
}

export interface ChatAgentOptions {
  vectorSearchHandler?: VectorSearchHandler;
}

// ============================================================
// Constants
// ============================================================

const MAX_SEARCH_ITERATIONS = 3;

/** HyDE + embed + hybrid search must finish before Convex action limits kill the stream (client saw only `searching` then disconnect). */
const SEARCH_PIPELINE_TIMEOUT_MS = parseInt(
  process.env.CHAT_SEARCH_PIPELINE_TIMEOUT_MS ?? '70000',
  10
);
const FOLLOWUP_GENERATION_TIMEOUT_MS = parseInt(
  process.env.CHAT_FOLLOWUP_TIMEOUT_MS ?? '15000',
  10
);
const RESPONSE_GENERATION_TIMEOUT_MS = parseInt(
  process.env.CHAT_RESPONSE_TIMEOUT_MS ?? '90000',
  10
);
/** Max executed search_documents calls per user message (parallel calls in one turn each count). */
const MAX_SEARCH_DOCUMENTS_CALLS = parseInt(env.CHAT_MAX_SEARCH_CALLS ?? '5', 10);
/** Chunks passed to the answer model and citation indices (after merge + rank). */
const MAX_CONTEXT_CHUNKS = parseInt(env.CHAT_MAX_CONTEXT_CHUNKS ?? '15', 10);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function chunkDedupKey(c: ReferenceChunk): string {
  return `${c.sourceId}:${c.chunkIndex}`;
}

function mergeChunkScores(existing: ReferenceChunk, incoming: ReferenceChunk): ReferenceChunk {
  const pickMax = (a?: number, b?: number): number | undefined => {
    const hasA = a != null && !Number.isNaN(a);
    const hasB = b != null && !Number.isNaN(b);
    if (!hasA && !hasB) return undefined;
    return Math.max(hasA ? (a as number) : 0, hasB ? (b as number) : 0);
  };
  return {
    ...existing,
    similarity: pickMax(existing.similarity, incoming.similarity),
    rrfScore: pickMax(existing.rrfScore, incoming.rrfScore),
  };
}

function chunkRankingScore(c: ReferenceChunk): number {
  if (c.similarity != null && !Number.isNaN(c.similarity)) return c.similarity;
  if (c.rrfScore != null && !Number.isNaN(c.rrfScore)) return c.rrfScore;
  return 0;
}

function rankAndCapChunks(chunks: ReferenceChunk[], maxN: number): ReferenceChunk[] {
  const sorted = [...chunks].sort((a, b) => chunkRankingScore(b) - chunkRankingScore(a));
  return sorted.length <= maxN ? sorted : sorted.slice(0, maxN);
}

/** Smaller token yields so the HTTP stream and UI update more frequently than whole-paragraph chunks. */
const STREAM_TOKEN_SLICE_CHARS = parseInt(process.env.CHAT_STREAM_TOKEN_SLICE_CHARS ?? '480', 10);
const STREAM_TOKEN_DELAY_MS = parseInt(process.env.CHAT_STREAM_TOKEN_DELAY_MS ?? '12', 10);

async function* sliceParagraphForStream(para: string): AsyncGenerator<string> {
  const trimmed = para.trim();
  if (!trimmed) return;
  const max = Math.max(120, STREAM_TOKEN_SLICE_CHARS);
  if (trimmed.length <= max) {
    yield trimmed + '\n\n';
    return;
  }
  let i = 0;
  while (i < trimmed.length) {
    let end = Math.min(i + max, trimmed.length);
    if (end < trimmed.length) {
      const sp = trimmed.lastIndexOf(' ', end);
      if (sp > i + 48) end = sp + 1;
    }
    const part = trimmed.slice(i, end).trimEnd();
    if (part) {
      yield part + (end >= trimmed.length ? '\n\n' : '');
    }
    i = end;
  }
}

/**
 * Expand query with keyword-based variations (no LLM overhead, ~10ms latency)
 * Helps find content when user's terminology doesn't match document terminology
 */
function expandQueryWithKeywords(query: string): string[] {
  const variations = [query];
  const lowerQuery = query.toLowerCase();

  // Domain-independent term mappings
  const termVariations: Record<string, string[]> = {
    // Comparison/contrast terms
    'difference': ['compare', 'contrast', 'vs', 'versus', 'comparison'],
    'how does it work': ['mechanism', 'algorithm', 'process', 'methodology', 'approach'],
    'advantages': ['benefits', 'pros', 'strengths'],
    'disadvantages': ['drawbacks', 'cons', 'weaknesses', 'limitations'],
    'example': ['instance', 'case', 'illustration'],

    // Common academic/technical variations
    'definition': ['define', 'meaning', 'what is', 'what are'],
    'explain': ['describe', 'elaborate', 'clarify'],
    'overview': ['summary', 'introduction', 'background'],
    'purpose': ['goal', 'objective', 'aim', 'function'],
    'result': ['outcome', 'output', 'consequence', 'effect'],
  };

  // Apply variations (limit to avoid too many search calls)
  let variationCount = 0;
  const maxVariations = 2;

  for (const [term, synonyms] of Object.entries(termVariations)) {
    if (lowerQuery.includes(term) && variationCount < maxVariations) {
      for (const synonym of synonyms.slice(0, 2)) {
        if (variationCount >= maxVariations) break;

        // Create variation by replacing the term
        const regex = new RegExp(term, 'gi');
        const variation = query.replace(regex, synonym);
        if (variation !== query) {
          variations.push(variation);
          variationCount++;
        }
      }
    }
  }

  return variations.slice(0, 3); // Limit to 3 total variations (original + 2)
}

const TOOL_DECISION_SYSTEM_PROMPT = `You are a study assistant helping a student understand their uploaded documents.

Your job is to decide what information to retrieve before answering.

**CRITICAL DISTINCTION ABOUT INFORMATION AVAILABILITY**:
- "The provided excerpts do not contain..." → Use this ONLY when the retrieved passages don't have the information
- "The sources do not contain..." → NEVER use this. You haven't seen all sources, only retrieved excerpts.

When retrieved excerpts don't contain the answer:
1. State clearly: "Based on the retrieved passages, I cannot find information about..."
2. Do NOT claim the sources don't contain it
3. Suggest what you DO find in the excerpts that might be related
4. If the user selected specific documents, acknowledge this and suggest they may need to rephrase or the information might be in other parts of those documents

**User's Selected Sources**: When the user has selected specific documents, they expect you to search those thoroughly. If you don't find something, acknowledge the limitation without claiming it's not there.

RULES:
1. You MUST call search_documents before answering any content question about the study material.
2. You may skip searching ONLY for: greetings, meta-questions about the app itself, or follow-ups already fully covered by a prior tool result in this conversation.
3. If the question is too ambiguous to search effectively, call ask_clarification instead.
4. When calling search_documents, rephrase the question as a declarative statement for better retrieval (e.g. "photosynthesis converts light into chemical energy" not "How does photosynthesis work?").
4b. If the question names, compares, or contrasts multiple distinct topics (e.g. two algorithms, two theories, cause vs. effect, "X versus Y"), your search query MUST name every distinct topic with clear wording — not only the first or most salient one — so retrieval can surface material for each part.
5. Prefer ONE strong search first. Call search_documents at most once per turn. Run a second search on a later turn only if the first results are clearly insufficient — do not batch multiple unrelated searches in a single turn. The system enforces a small search budget per question.`;

/** OpenAI-style tool defs so LangChain/Together receive `type: "function"` (required by inference v2). */
const SEARCH_TOOL_DEF = {
  type: 'function' as const,
  function: {
    name: 'search_documents',
    description: "Search the user's uploaded documents for relevant information. Always call this before answering content questions.",
    parameters: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Declarative search string for retrieval. For comparisons or multi-topic questions, name every distinct subject (e.g. both methods in an X vs Y question), not just one.',
        },
      },
      required: ['query'],
    },
  },
};

const CLARIFY_TOOL_DEF = {
  type: 'function' as const,
  function: {
    name: 'ask_clarification',
    description: 'Ask the user to clarify their question when it is too ambiguous to search effectively.',
    parameters: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string',
          description: 'The clarifying question to show the user',
        },
      },
      required: ['question'],
    },
  },
};

// ============================================================
// Chat Agent Service
// ============================================================

export class ChatAgent {
  private llmWrapper: ChatLLMWrapper;
  private vectorSearch: VectorSearchHandler;
  private embeddingService: EmbeddingService;

  constructor(options?: ChatAgentOptions) {
  this.llmWrapper = new ChatLLMWrapper({
    apiKey: env.TOGETHER_AI_API_KEY,
    model: env.SMART_LLM || 'openai/gpt-oss-120b',
    temperature: parseFloat(env.CHAT_LLM_TEMPERATURE ?? '0.1'),
    fastModel: env.FAST_LLM,
    fastApiKey: env.TOGETHER_AI_API_KEY,
  });

  this.vectorSearch =
    options?.vectorSearchHandler ??
    new VectorSearchHandler({
      vectorMatchThreshold: parseFloat(env.CHAT_VECTOR_MATCH_THRESHOLD ?? '0.3'),
      vectorMatchCount: parseInt(env.CHAT_VECTOR_MATCH_COUNT ?? '25', 10),
      rerankThreshold: parseInt(env.CHAT_RERANK_THRESHOLD ?? '5', 10),
      rerankTopN: parseInt(env.CHAT_RERANK_TOP_N ?? '15', 10),
      maxResults: parseInt(env.CHAT_MAX_RESULTS ?? '7', 10),
    });

  this.embeddingService = new EmbeddingService(env.OPENAI_API_KEY);
}

  async *streamResponse(
  context: ChatAgentContext,
  userMessage: string
): AsyncGenerator<StreamChunk> {
  console.log('[ChatAgent] ========== STREAM START ==========');
  console.log(`[ChatAgent] User message: "${userMessage}"`);

  try {
    const recentTurns = context.conversationHistory.slice(-6);
    const allChunks: ReferenceChunk[] = [];

    // ============================================================
    // PHASE 1: Tool-calling loop — LLM decides what to search
    // ============================================================

    console.log('[ChatAgent] Phase 1: Tool-calling decision loop');

    const messages: BaseMessage[] = [
      new SystemMessage(TOOL_DECISION_SYSTEM_PROMPT),
      ...recentTurns.map((t) =>
        t.role === 'user' ? new HumanMessage(t.content) : new AIMessage(t.content)
      ),
      new HumanMessage(userMessage),
    ];

    const llmWithTools = this.llmWrapper.bindDecisionTools([SEARCH_TOOL_DEF, CLARIFY_TOOL_DEF]);

    let iterations = 0;
    let searchCallCount = 0;
    while (iterations < MAX_SEARCH_ITERATIONS) {
      const response = await llmWithTools.invoke(messages);
      messages.push(response as AIMessage);

      const toolCalls = (response as any).tool_calls as Array<{ name: string; args: any; id?: string }> | undefined;

      if (!toolCalls || toolCalls.length === 0) {
        console.log(
          `[ChatAgent] Phase 1 finished — model returned no further tools (iterations=${iterations}, chunks=${allChunks.length})`
        );
        break;
      }

      for (const call of toolCalls) {
        if (call.name === 'ask_clarification') {
          const question = call.args?.question ?? 'Could you clarify your question?';
          console.log(`[ChatAgent] LLM requested clarification: "${question}"`);
          yield { type: 'clarification', data: { question } };
          yield { type: 'done' };
          return;
        }

        if (call.name === 'search_documents') {
          const query: string = call.args?.query ?? userMessage;

          if (searchCallCount >= MAX_SEARCH_DOCUMENTS_CALLS) {
            console.warn(
              `[ChatAgent] search_documents skipped — budget exhausted (${MAX_SEARCH_DOCUMENTS_CALLS}) for query: "${query}"`
            );
            yield {
              type: 'tool_call',
              data: { tool: 'search_documents', query, status: 'done', resultCount: 0, skipped: true },
            };
            messages.push(
              new ToolMessage({
                content:
                  'Search budget exhausted for this question; use the passages already retrieved. Respond from existing tool results only.',
                tool_call_id: call.id ?? `call_budget_${iterations}`,
              })
            );
            continue;
          }

          console.log(`[ChatAgent] search_documents called with query: "${query}"`);

          yield { type: 'tool_call', data: { tool: 'search_documents', query, status: 'searching' } };

          let newChunks: ReferenceChunk[] = [];
          try {
            const pipelineDeadline = Date.now() + SEARCH_PIPELINE_TIMEOUT_MS;
            const remainingMs = () => {
              const ms = pipelineDeadline - Date.now();
              if (ms <= 0) {
                throw new Error(`search_pipeline timed out after ${SEARCH_PIPELINE_TIMEOUT_MS}ms`);
              }
              return ms;
            };

            yield {
              type: 'status',
              status: 'retrieving',
              message: 'Shaping a hypothetical answer to improve retrieval quality…',
            };
            const hydeText = await withTimeout(
              this.llmWrapper.generateHypotheticalDocument(query),
              remainingMs(),
              'hyde_generation'
            );
            yield {
              type: 'status',
              status: 'embedding',
              message: 'Embedding the query for semantic search…',
            };
            // Keep the tool’s declarative query in the embedding input so explicit terms
            // (e.g. every side of a comparison) are not lost if HyDE over-emphasizes one topic.
            const textForVectorEmbedding = [query.trim(), hydeText.trim()].filter(Boolean).join('\n\n');
            const hydeEmbedding = await withTimeout(
              this.embeddingService.embedText(textForVectorEmbedding),
              remainingMs(),
              'hyde_embedding'
            );
            yield {
              type: 'status',
              status: 'ranking',
              message: 'Running hybrid search and reranking passages…',
            };

            // Query expansion for selected sources: search with multiple query variations
            if (context.documentIds?.length) {
              // User selected specific documents - expand query to improve recall
              const expandedQueries = expandQueryWithKeywords(query);
              console.log(`[ChatAgent] Expanded queries (${expandedQueries.length} variations):`, expandedQueries.map(q => q.slice(0, 50)));

              // Search with each variation, merging and deduplicating results
              const allResults = [];
              const seenChunkKeys = new Set<string>();

              for (const queryVariation of expandedQueries) {
                const variationResults = await withTimeout(
                  this.vectorSearch.search(
                    context.userId,
                    context.noteId,
                    queryVariation,
                    context.documentIds,
                    hydeEmbedding,
                    hydeText
                  ),
                  remainingMs(),
                  'vector_hybrid_search'
                );

                // Merge without duplicates
                for (const chunk of variationResults) {
                  const key = chunkDedupKey(chunk);
                  if (!seenChunkKeys.has(key)) {
                    allResults.push(chunk);
                    seenChunkKeys.add(key);
                  }
                }
              }

              newChunks = allResults;
            } else {
              // No selected sources - normal single query search
              newChunks = await withTimeout(
                this.vectorSearch.search(
                  context.userId,
                  context.noteId,
                  query,
                  context.documentIds,
                  hydeEmbedding,
                  hydeText
                ),
                remainingMs(),
                'vector_hybrid_search'
              );
            }
          } catch (e) {
            console.warn('[ChatAgent] Search pipeline failed or timed out:', e);
            newChunks = [];
          }

          searchCallCount += 1;

          for (const chunk of newChunks) {
            const key = chunkDedupKey(chunk);
            const idx = allChunks.findIndex((c) => chunkDedupKey(c) === key);
            if (idx < 0) {
              allChunks.push(chunk);
            } else {
              allChunks[idx] = mergeChunkScores(allChunks[idx], chunk);
            }
          }

          console.log(`[ChatAgent] search returned ${newChunks.length} chunks (total: ${allChunks.length})`);

          yield {
            type: 'tool_call',
            data: { tool: 'search_documents', query, status: 'done', resultCount: allChunks.length },
          };

          messages.push(
            new ToolMessage({
              content: `Found ${newChunks.length} relevant passages.`,
              tool_call_id: call.id ?? `call_${iterations}`,
            })
          );
        }
      }

      iterations++;
    }

    // ============================================================
    // DIRECT RESPONSE: LLM chose not to search (no RAG needed)
    // ============================================================

    if (allChunks.length === 0) {
      console.log('[ChatAgent] No chunks — streaming direct response');
      yield { type: 'status', status: 'thinking', message: 'Generating response...' };
      const directAnswer = await this.llmWrapper.generateDirectResponse(userMessage, recentTurns);
      for (const para of directAnswer.split(/\n\n+/)) {
        if (para.trim().length > 0) {
          for await (const piece of sliceParagraphForStream(para)) {
            yield { type: 'token', data: piece };
            await new Promise((resolve) => setTimeout(resolve, STREAM_TOKEN_DELAY_MS));
          }
        }
      }
      yield { type: 'done' };
      console.log('[ChatAgent] ========== STREAM COMPLETE (direct) ==========');
      return;
    }

    const rankedChunks = rankAndCapChunks(allChunks, MAX_CONTEXT_CHUNKS);
    if (rankedChunks.length < allChunks.length) {
      console.log(
        `[ChatAgent] Capped context: ${allChunks.length} merged chunks → top ${rankedChunks.length} for generation`
      );
    }
    allChunks.length = 0;
    allChunks.push(...rankedChunks);

    // Send references so the UI can show what's being used (same ordering as model context)
    yield { type: 'status', status: 'reading', message: `Reading ${allChunks.length} passages...` };
    yield { type: 'references', data: allChunks };

    // ============================================================
    // PHASE 2: Generate structured response with citations
    // ============================================================

    console.log('[ChatAgent] Phase 2: Generating grounded response');
    yield { type: 'status', status: 'thinking', message: 'Formulating answer...' };

    let structuredResponse: ChatResponse = await withTimeout(
      this.llmWrapper.generateStructuredResponse(allChunks, userMessage, recentTurns),
      RESPONSE_GENERATION_TIMEOUT_MS,
      'response_generation'
    );

    // ============================================================
    // PHASE 3: Grounding validation + one retry on failure
    // ============================================================

    console.log('[ChatAgent] Phase 3: Validating grounding');

    // Run syntactic check first (sync, free). Only run the semantic embedding
    // check (async, costs an API call) when syntactic passes.
    const syntacticValidation = validateGrounding(structuredResponse.answer_markdown, allChunks);
    const semanticValidation = syntacticValidation.isGrounded
      ? await validateSemanticGrounding(structuredResponse.answer_markdown, allChunks, this.embeddingService)
      : { isGrounded: false, issues: [], missingCitations: false };

    let isGrounded = syntacticValidation.isGrounded && semanticValidation.isGrounded;
    let semanticOnlyFailure = false;

    if (!isGrounded) {
      if (syntacticValidation.isGrounded && !semanticValidation.isGrounded) {
        semanticOnlyFailure = true;
        console.warn(
          '[ChatAgent] Semantic grounding below threshold — keeping first response (no strict retry):',
          semanticValidation.issues
        );
      } else {
        console.warn('[ChatAgent] Grounding failed — retrying with strict grounding');
        structuredResponse = await withTimeout(
          this.llmWrapper.generateWithStrictGrounding(allChunks, userMessage, recentTurns),
          RESPONSE_GENERATION_TIMEOUT_MS,
          'strict_grounding_retry'
        );

        const retrySyntactic = validateGrounding(structuredResponse.answer_markdown, allChunks);
        const retrySemantic = retrySyntactic.isGrounded
          ? await validateSemanticGrounding(structuredResponse.answer_markdown, allChunks, this.embeddingService)
          : { isGrounded: false, issues: [], missingCitations: false };
        isGrounded = retrySyntactic.isGrounded && retrySemantic.isGrounded;
      }
    }

    // Stream final answer by paragraphs
    yield { type: 'status', status: 'generating', message: 'Generating response...' };
    const finalText = structuredResponse.answer_markdown;
    for (const para of finalText.split(/\n\n+/)) {
      if (para.trim().length > 0) {
        for await (const piece of sliceParagraphForStream(para)) {
          yield { type: 'token', data: piece };
          await new Promise((resolve) => setTimeout(resolve, STREAM_TOKEN_DELAY_MS));
        }
      }
    }

    if (!isGrounded) {
      const syntacticIssues = validateGrounding(structuredResponse.answer_markdown, allChunks).issues;
      const allIssues = semanticOnlyFailure
        ? [...semanticValidation.issues, ...syntacticIssues]
        : syntacticIssues;
      yield {
        type: 'grounding_check',
        data: {
          passed: false,
          issues: allIssues,
          message: semanticOnlyFailure
            ? 'Note: Automated check suggests the answer may be only loosely aligned with cited passages'
            : 'Note: This response may not be fully grounded in your documents',
        },
      };
    }

    if (structuredResponse.confidence !== 'high') {
      yield {
        type: 'grounding_check',
        data: {
          passed: structuredResponse.confidence !== 'low',
          issues: structuredResponse.confidence === 'low' ? ['Low confidence in source coverage'] : [],
          message: `Response confidence: ${structuredResponse.confidence}`,
        },
      };
    }

    // ============================================================
    // PHASE 4: Follow-up question suggestions
    // ============================================================

    let followUps: string[] = [];
    try {
      followUps = await withTimeout(
        this.llmWrapper.generateFollowUpQuestions(userMessage, finalText),
        FOLLOWUP_GENERATION_TIMEOUT_MS,
        'follow_up_questions'
      );
    } catch (e) {
      console.warn('[ChatAgent] Follow-up generation timed out or failed:', e);
    }
    if (followUps.length > 0) {
      yield { type: 'followups', data: followUps };
    }

    yield { type: 'done' };

    console.log('[ChatAgent] ========== STREAM COMPLETE ==========');
  } catch (error) {
    console.error('[ChatAgent] ========== ERROR ==========', error);

    let errorMessage = 'Unknown error occurred';
    let errorType = 'unknown';

    if (error instanceof Error) {
      errorMessage = error.message;
      if (error.message.includes('No results found') || error.message.includes('No relevant documents')) {
        errorType = 'no_documents';
      } else if (error.message.includes('Vector search failed') || error.message.includes('Hybrid search failed')) {
        errorType = 'search_failed';
      } else if (error.message.includes('API key')) {
        errorType = 'api_error';
      } else if (error.message.includes('Invalid document ID')) {
        errorType = 'validation_error';
      } else if (error.message.includes('timed out')) {
        errorType = 'timeout';
      }
    }

    yield { type: 'error', data: { message: errorMessage, type: errorType } };
  }
}
}

// ============================================================
// Re-exports for backward compatibility
// ============================================================

export type { ChatResponse } from './chat/llm_wrapper.js';
export { validateGrounding, isArtifactContent, validateSemanticGrounding } from './chat/grounding_validator.js';
export { VectorSearchHandler } from './chat/vector_search.js';

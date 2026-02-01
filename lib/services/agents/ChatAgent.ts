"use node"
/**
 * Chat Agent Service
 *
 * Orchestrates chat responses with strict RAG (Retrieval-Augmented Generation)
 * using extracted modules for vector search, grounding validation, and LLM generation.
 *
 * This refactored version uses composition patterns with dedicated modules:
 * - VectorSearchHandler: Hybrid search with reranking
 * - ChatLLMWrapper: Structured output generation
 * - validateGrounding: Grounding validation
 */

import { env } from '../../helpers/env';

// Import extracted modules
import { VectorSearchHandler } from './chat/vector-search.js';
import { ChatLLMWrapper, type ChatResponse } from './chat/llm-wrapper.js';
import { validateGrounding, isArtifactContent, validateSemanticGrounding } from './chat/grounding-validator.js';
import { EmbeddingService } from '../processing/EmbeddingServiceClient.js';

// ============================================================
// Types
// ============================================================

/**
 * Context for chat agent execution.
 */
export interface ChatAgentContext {
  userId: string;
  noteId: string;
  conversationHistory: Array<{ role: string; content: string }>;
  documentIds?: string[];
}

/**
 * Stream chunk for streaming responses.
 */
export interface StreamChunk {
  type: 'token' | 'references' | 'done' | 'error' | 'warning' | 'grounding_check' | 'status';
  data?: any;
  status?: string;
  message?: string;
}

/**
 * Result of grounding validation.
 */
export interface GroundingValidationResult {
  isGrounded: boolean;
  missingCitations: boolean;
  issues: string[];
}

// ============================================================
// Chat Agent Service
// ============================================================

export interface ChatAgentOptions {
  /** When running in Convex, pass a handler that uses Convex vector search + ZeroEntropy reranking */
  vectorSearchHandler?: VectorSearchHandler;
}

/**
 * Main chat agent class that orchestrates RAG-based chat responses.
 * For Convex backend, pass vectorSearchHandler so search uses Convex + reranking.
 */
export class ChatAgent {
  private llmWrapper: ChatLLMWrapper;
  private vectorSearch: VectorSearchHandler;
  private embeddingService: EmbeddingService;

  constructor(options?: ChatAgentOptions) {
    // Initialize LLM wrapper
    this.llmWrapper = new ChatLLMWrapper({
      apiKey: env.TOGETHER_AI_API_KEY,
      model: env.SMART_LLM || 'Qwen/Qwen3-Next-80B-A3B-Instruct',
      temperature: parseFloat(env.CHAT_LLM_TEMPERATURE ?? '0.1'),
    });

    // Use injected handler (Convex) or build one that requires runner at search time
    this.vectorSearch =
      options?.vectorSearchHandler ??
      new VectorSearchHandler({
        vectorMatchThreshold: parseFloat(env.CHAT_VECTOR_MATCH_THRESHOLD ?? '0.3'),
        vectorMatchCount: parseInt(env.CHAT_VECTOR_MATCH_COUNT ?? '25', 10),
        rerankThreshold: parseInt(env.CHAT_RERANK_THRESHOLD ?? '5', 10),
        rerankTopN: parseInt(env.CHAT_RERANK_TOP_N ?? '15', 10),
        maxResults: parseInt(env.CHAT_MAX_RESULTS ?? '7', 10),
      });

    // Initialize embedding service for semantic grounding validation
    this.embeddingService = new EmbeddingService(env.OPENAI_API_KEY);
  }

  /**
   * Streams response using strict RAG pattern (retrieve first, then generate).
   *
   * This eliminates agentic decision-making and ensures grounding by:
   * 1. Retrieving relevant documents (deterministic, no LLM decision)
   * 2. Generating structured output with citations
   * 3. Validating grounding of the response
   *
   * @param context - Chat execution context
   * @param userMessage - The user's question
   * @yields Stream chunks with tokens, references, and status updates
   */
  async *streamResponse(context: ChatAgentContext, userMessage: string): AsyncGenerator<StreamChunk> {
    console.log('[ChatAgent] ========== STREAM START (Strict RAG) ==========');
    console.log(`[ChatAgent] User message: "${userMessage}"`);
    console.log(`[ChatAgent] Context: noteId=${context.noteId}`);

    try {
      // ============================================================
      // PHASE 1: Retrieval (deterministic, no LLM decision)
      // ============================================================

      console.log('[ChatAgent] Phase 1: Retrieving relevant documents');
      yield { type: 'status', status: 'searching', message: 'Searching relevant sources...' };

      const chunks = await this.vectorSearch.search(
        context.userId,
        context.noteId,
        userMessage,
        context.documentIds
      );

      console.log(`[ChatAgent] Retrieved ${chunks.length} relevant chunks`);
      yield { type: 'status', status: 'reading', message: `Reading ${chunks.length} sources...` };

      // Immediately send references so user sees what's being used
      yield { type: 'references', data: chunks };

      // ============================================================
      // PHASE 2: Generation with structured output
      // ============================================================

      console.log('[ChatAgent] Phase 2: Generating grounded response (structured output)');
      yield { type: 'status', status: 'thinking', message: 'Analyzing sources and formulating response...' };

      // Extract recent user questions for conversation context (last 3)
      const recentUserQuestions = context.conversationHistory
        .filter((msg) => msg.role === 'user')
        .slice(-3)
        .map((msg) => msg.content);

      console.log(`[ChatAgent] Including ${recentUserQuestions.length} previous questions for context`);

      // Generate structured response with citations and conversation context
      const structuredResponse = await this.llmWrapper.generateStructuredResponse(
        chunks,
        userMessage,
        recentUserQuestions
      );

      // Yield the answer as tokens for compatibility with existing streaming interface
      yield { type: 'status', status: 'generating', message: 'Generating response...' };
      const answerText = structuredResponse.answer_markdown;

      // Stream by paragraphs/sentences for better Markdown rendering
      // This preserves markdown formatting better than arbitrary character chunks
      const paragraphs = answerText.split(/\n\n+/);
      for (const para of paragraphs) {
        if (para.trim().length > 0) {
          yield { type: 'token', data: para + '\n\n' };
          // Small delay for readability
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      }

      console.log(`[ChatAgent] Generated response length: ${answerText.length} characters`);

      // Extract citations from markdown for logging
      const citationMatches = [...answerText.matchAll(/\[(\d+)\]/g)];
      const citedIndices = [...new Set(citationMatches.map((m) => parseInt(m[1])))]
        .filter((n) => !isNaN(n))
        .sort((a, b) => a - b);
      console.log(
        `[ChatAgent] Cited indices: [${citedIndices.join(', ')}], Confidence: ${structuredResponse.confidence}`
      );

      // ============================================================
      // PHASE 3: Validation (syntactic + semantic)
      // ============================================================

      console.log('[ChatAgent] Phase 3: Validating grounding');

      // First, syntactic validation (citations exist and are valid)
      const syntacticValidation = validateGrounding(answerText, chunks);

      // Second, semantic validation (cited content actually supports claims)
      console.log('[ChatAgent] Running semantic grounding validation...');
      const semanticValidation = await validateSemanticGrounding(answerText, chunks, this.embeddingService);

      // Combine both validation results
      const allIssues = [...syntacticValidation.issues, ...semanticValidation.issues];
      const isGrounded = syntacticValidation.isGrounded && semanticValidation.isGrounded;

      if (!isGrounded) {
        console.warn(`[ChatAgent] Grounding validation failed: ${allIssues.join(', ')}`);
        yield {
          type: 'grounding_check',
          data: {
            passed: false,
            issues: allIssues,
            message: 'Note: This response may not be fully grounded in your documents',
          },
        };
      } else {
        console.log('[ChatAgent] Grounding validation passed (syntactic + semantic)');
      }

      // Emit confidence score from structured output
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

      yield { type: 'done' };

      console.log(`[ChatAgent] ========== STREAM COMPLETE ==========`);
      console.log(
        `[ChatAgent] Response: ${answerText.length} chars, Sources: ${chunks.length}, Validation: ${isGrounded ? 'PASSED' : 'FAILED'}`
      );
    } catch (error) {
      console.error('[ChatAgent] ========== ERROR ==========');
      console.error('[ChatAgent] Error:', error);

      // Classify error types for better user messaging
      let errorMessage = 'Unknown error occurred';
      let errorType = 'unknown';

      if (error instanceof Error) {
        errorMessage = error.message;

        // Classify common errors
        if (
          error.message.includes('No results found') ||
          error.message.includes('No relevant documents')
        ) {
          errorType = 'no_documents';
        } else if (
          error.message.includes('Vector search failed') ||
          error.message.includes('Hybrid search failed')
        ) {
          errorType = 'search_failed';
        } else if (error.message.includes('API key')) {
          errorType = 'api_error';
        } else if (error.message.includes('Invalid document ID')) {
          errorType = 'validation_error';
        }
      }

      console.error(`[ChatAgent] Error type: ${errorType}, message: ${errorMessage}`);

      yield {
        type: 'error',
        data: { message: errorMessage, type: errorType },
      };
    }
  }
}

// ============================================================
// Re-exports for backward compatibility
// ============================================================

export type { ChatResponse } from './chat/llm-wrapper.js';
export { validateGrounding, isArtifactContent, validateSemanticGrounding } from './chat/grounding-validator.js';
export { VectorSearchHandler } from './chat/vector-search.js';

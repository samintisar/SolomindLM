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

import { z } from 'zod';
import { env } from '../../config/env.js';

// Import extracted modules
import { VectorSearchHandler } from './chat/vector-search.js';
import { ChatLLMWrapper, type ChatResponse } from './chat/llm-wrapper.js';
import { validateGrounding, isArtifactContent } from './chat/grounding-validator.js';
import type { ReferenceChunk } from './chat/vector-search.js';

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

/**
 * Main chat agent class that orchestrates RAG-based chat responses.
 */
export class ChatAgent {
  private llmWrapper: ChatLLMWrapper;
  private vectorSearch: VectorSearchHandler;

  constructor() {
    // Initialize LLM wrapper
    this.llmWrapper = new ChatLLMWrapper({
      apiKey: env.TOGETHER_AI_API_KEY,
      model: env.SMART_LLM || 'Qwen/Qwen3-Next-80B-A3B-Instruct',
      temperature: parseFloat(env.CHAT_LLM_TEMPERATURE ?? '0.1'),
    });

    // Initialize vector search handler
    this.vectorSearch = new VectorSearchHandler({
      vectorMatchThreshold: parseFloat(env.CHAT_VECTOR_MATCH_THRESHOLD ?? '0.3'),
      vectorMatchCount: parseInt(env.CHAT_VECTOR_MATCH_COUNT ?? '25', 10),
      rerankThreshold: parseInt(env.CHAT_RERANK_THRESHOLD ?? '5', 10),
      rerankTopN: parseInt(env.CHAT_RERANK_TOP_N ?? '15', 10),
      maxResults: parseInt(env.CHAT_MAX_RESULTS ?? '7', 10),
    });
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

      // Generate structured response with citations
      const structuredResponse = await this.llmWrapper.generateStructuredResponse(
        chunks,
        userMessage,
        [] // Empty array - no conversation context in generation
      );

      // Yield the answer as tokens for compatibility with existing streaming interface
      yield { type: 'status', status: 'generating', message: 'Generating response...' };
      const answerText = structuredResponse.answer_markdown;
      const chunkSize = 50; // Send in chunks to simulate streaming

      for (let i = 0; i < answerText.length; i += chunkSize) {
        const chunk = answerText.slice(i, i + chunkSize);
        yield { type: 'token', data: chunk };
      }

      console.log(`[ChatAgent] Generated response length: ${answerText.length} characters`);
      console.log(
        `[ChatAgent] Cited indices: [${structuredResponse.cited_indices.join(', ')}], Confidence: ${structuredResponse.confidence}`
      );

      // ============================================================
      // PHASE 3: Validation
      // ============================================================

      console.log('[ChatAgent] Phase 3: Validating grounding');

      const validation = validateGrounding(answerText, chunks);

      if (!validation.isGrounded) {
        console.warn(`[ChatAgent] Grounding validation failed: ${validation.issues.join(', ')}`);
        yield {
          type: 'grounding_check',
          data: {
            passed: false,
            issues: validation.issues,
            message: 'Note: This response may not be fully grounded in your documents',
          },
        };
      } else {
        console.log('[ChatAgent] Grounding validation passed');
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
        `[ChatAgent] Response: ${answerText.length} chars, Sources: ${chunks.length}, Validation: ${validation.isGrounded ? 'PASSED' : 'FAILED'}`
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
export { validateGrounding, isArtifactContent } from './chat/grounding-validator.js';
export { VectorSearchHandler } from './chat/vector-search.js';

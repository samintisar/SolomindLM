/**
 * LLM wrapper for chat agent.
 *
 * Handles structured output generation with citations using TogetherAI.
 */

import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { ReferenceChunk } from '../../storage/ChatHistoryService.js';

// ============================================================
// Types
// ============================================================

/**
 * Structured chat response with citations.
 */
export interface ChatResponse {
  /** The answer in markdown format with inline citation markers */
  answer_markdown: string;
  /** Array of citation indices used in the answer (1-indexed) */
  cited_indices: number[];
  /** Confidence level based on source coverage */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Configuration for the LLM wrapper.
 */
export interface LLMWrapperConfig {
  /** TogetherAI API key */
  apiKey: string;
  /** Model to use for generation */
  model: string;
  /** Temperature for generation (default: 0.1) */
  temperature?: number;
}

// ============================================================
// Schemas
// ============================================================

/**
 * Schema for structured chat response with citations.
 * This ensures the LLM returns properly formatted output.
 */
export const ChatResponseSchema = z.object({
  answer_markdown: z
    .string()
    .describe('The answer in markdown format with inline citation markers like [1], [2], etc.'),
  cited_indices: z.array(z.number()).describe('Array of citation indices used in the answer (1-indexed)'),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe('Confidence level based on source coverage'),
});

// ============================================================
// Constants
// ============================================================

/**
 * Strict grounding rules for the LLM.
 */
const STRICT_GROUNDING_RULES = `You are a research assistant helping users understand their uploaded documents.

CRITICAL GROUNDING RULES:
1. ONLY use information from the numbered excerpts below
2. Every factual claim MUST have a citation [1], [2], etc.
3. If multiple excerpts support a claim, cite all: [1][2]
4. If you're unsure or information is missing, say: "I don't have information about this in your documents"
5. DO NOT use phrases like "I think", "probably", "might be", "could be", "it seems", "perhaps", "maybe" - only state facts from excerpts
6. DO NOT add information from your training data
7. DO NOT make logical leaps beyond what's explicitly stated
8. When answering, write natural language prose with inline citations after each fact

DOCUMENT EXCERPTS:
`;

// ============================================================
// LLM Wrapper Class
// ============================================================

/**
 * Handles LLM response generation with structured output and citations.
 */
export class ChatLLMWrapper {
  private llm: ChatTogetherAI;

  constructor(config: LLMWrapperConfig) {
    this.llm = new ChatTogetherAI({
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature ?? 0.1,
    });
  }

  /**
   * Generates a structured response with citations using tool calling.
   *
   * @param chunks - Reference chunks to use as context
   * @param userMessage - The user's question
   * @param userQuestions - Previous user questions for context
   * @returns Structured chat response with citations
   */
  async generateStructuredResponse(
    chunks: ReferenceChunk[],
    userMessage: string,
    userQuestions: string[] = []
  ): Promise<ChatResponse> {
    console.log('[ChatLLMWrapper] Generating structured response with citations');

    // Create a model with structured output
    // Note: TogetherAI supports structured output through tool/function calling
    const structuredLlm = (this.llm as any).withStructuredOutput(ChatResponseSchema, {
      name: 'chat_response',
    });

    const groundedPrompt = this.buildStrictGroundingPrompt(chunks, userMessage, userQuestions);

    const messages = [new SystemMessage(STRICT_GROUNDING_RULES), new HumanMessage(groundedPrompt)];

    try {
      const response: any = await structuredLlm.invoke(messages);

      // Validate the response matches our schema
      const validated = ChatResponseSchema.safeParse(response);

      if (!validated.success) {
        console.warn('[ChatLLMWrapper] Structured output validation failed:', validated.error.errors);
        // Fallback: create a basic response from the raw output
        return {
          answer_markdown: String(response?.answer_markdown || response || ''),
          cited_indices: response?.cited_indices || [],
          confidence: response?.confidence || 'medium',
        };
      }

      console.log('[ChatLLMWrapper] Structured response generated successfully');
      console.log(
        `[ChatLLMWrapper] Citations: [${validated.data.cited_indices.join(', ')}], Confidence: ${validated.data.confidence}`
      );

      return validated.data;
    } catch (error) {
      console.error('[ChatLLMWrapper] Structured output generation failed:', error);
      // Fallback to empty response
      return {
        answer_markdown: 'I apologize, but I encountered an error generating a structured response.',
        cited_indices: [],
        confidence: 'low',
      };
    }
  }

  /**
   * Builds a strict grounding prompt with context chunks.
   */
  private buildStrictGroundingPrompt(
    chunks: ReferenceChunk[],
    userMessage: string,
    userQuestions: string[]
  ): string {
    // Format chunks with numbered citations
    const formattedChunks = chunks
      .map(
        (chunk, index) =>
          `[${index + 1}] (from "${chunk.sourceTitle}", chunk ${chunk.chunkIndex}):\n${chunk.content}`
      )
      .join('\n\n---\n\n');

    // Build contextual query from previous user questions
    const contextualQuery =
      userQuestions.length > 0
        ? `Previous questions:\n${userQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nCurrent question: ${userMessage}`
        : `Question: ${userMessage}`;

    return `${STRICT_GROUNDING_RULES}

${formattedChunks}

${contextualQuery}

ANSWER:`;
  }
}

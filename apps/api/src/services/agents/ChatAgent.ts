import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { supabase } from '../../config/database.js';
import { env } from '../../config/env.js';
import { EmbeddingService } from '../processing/EmbeddingService.js';
import type { ReferenceChunk } from '../storage/ChatHistoryService.js';

// ============================================================
// Structured Output Schema
// ============================================================

/**
 * Schema for structured chat response with citations
 * This ensures the LLM returns properly formatted output
 */
export const ChatResponseSchema = z.object({
  answer_markdown: z.string().describe('The answer in markdown format with inline citation markers like [1], [2], etc.'),
  cited_indices: z.array(z.number()).describe('Array of citation indices used in the answer (1-indexed)'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Confidence level based on source coverage'),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;

// ============================================================
// Validation Utilities
// ============================================================

const DocumentIdSchema = z.array(z.string().uuid()).max(100).optional();

/**
 * Validate document IDs are proper UUIDs
 * @throws Error if validation fails
 */
function validateDocumentIds(documentIds?: string[]): void {
  if (documentIds && documentIds.length > 0) {
    const result = DocumentIdSchema.safeParse(documentIds);
    if (!result.success) {
      const errorDetails = result.error.errors
        .map((e: any) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw new Error(`Invalid document IDs: ${errorDetails}`);
    }
  }
}

// ============================================================
// Configuration
// ============================================================

const CHAT_CONFIG = {
  TEMPERATURE: parseFloat(env.CHAT_LLM_TEMPERATURE ?? '0.1'),
  MAX_HISTORY_MESSAGES: parseInt(env.CHAT_MAX_HISTORY_MESSAGES ?? '20', 10),
  VECTOR_MATCH_THRESHOLD: parseFloat(env.CHAT_VECTOR_MATCH_THRESHOLD ?? '0.4'),
  VECTOR_MATCH_COUNT: parseInt(env.CHAT_VECTOR_MATCH_COUNT ?? '25', 10),
  RERANK_THRESHOLD: parseInt(env.CHAT_RERANK_THRESHOLD ?? '5', 10),
  RERANK_TOP_N: parseInt(env.CHAT_RERANK_TOP_N ?? '15', 10),
  MAX_RESULTS: parseInt(env.CHAT_MAX_RESULTS ?? '7', 10),
} as const;

// ============================================================
// Strict Grounding Rules
// ============================================================

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
// Types
// ============================================================

export interface ChatAgentContext {
  userId: string;
  noteId: string;
  conversationHistory: Array<{ role: string; content: string }>;
  documentIds?: string[]; // Optional: filter to specific documents
}

export interface StreamChunk {
  type: 'token' | 'references' | 'done' | 'error' | 'warning' | 'grounding_check' | 'status';
  data?: any;
  status?: string;
  message?: string;
}

export interface GroundingValidationResult {
  isGrounded: boolean;
  missingCitations: boolean;
  issues: string[];
}

// ============================================================
// Chat Agent Service
// ============================================================

export class ChatAgent {
  private llm: ChatTogetherAI;
  private embeddingService: EmbeddingService;

  constructor() {
    this.llm = new ChatTogetherAI({
      apiKey: env.TOGETHER_AI_API_KEY,
      model: env.SMART_LLM,
      temperature: CHAT_CONFIG.TEMPERATURE,
    });
    this.embeddingService = new EmbeddingService(env.COHERE_API_KEY);
  }

  /**
   * Check if content is an artifact (JSON, references, etc.) that should be filtered from user-facing output
   */
  private isArtifactContent(content: string): boolean {
    const trimmed = content.trim();

    // Skip empty content
    if (trimmed.length === 0) {
      return true;
    }

    // Check if it's a valid JSON array (try parsing)
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return true; // Valid JSON array - likely an artifact
        }
      } catch {
        // Not valid JSON, continue checking
      }
    }

    // Check for reference section headers
    const referenceHeaders = /^(references|sources|citations|bibliography):\s*$/i;
    if (referenceHeaders.test(trimmed)) {
      return true;
    }

    // Check for tool output pattern (has known keys from our schema)
    const toolOutputPattern = /"(id|sourceTitle|chunkIndex|similarity)":\s*"/;
    if (toolOutputPattern.test(trimmed)) {
      return true;
    }

    return false;
  }

  /**
   * Validate response is grounded in provided sources
   * Checks for citations and validates they reference valid sources
   */
  private validateGrounding(response: string, sources: ReferenceChunk[]): GroundingValidationResult {
    const issues: string[] = [];

    // Check for citations
    const citationPattern = /\[(\d+)\]/g;
    const citations = [...response.matchAll(citationPattern)];

    if (citations.length === 0) {
      issues.push('No citations found in response');
    }

    // Verify cited IDs exist
    const maxId = sources.length;
    const seenIds = new Set<number>();

    for (const match of citations) {
      const id = parseInt(match[1]);
      if (id > maxId || id < 1) {
        issues.push(`Invalid citation [${id}] - only ${maxId} sources provided`);
      }
      seenIds.add(id);
    }

    // Check for hedging phrases that indicate uncertainty
    const uncertainPhrases = [
      'i think', 'probably', 'might be', 'could be',
      'it seems', 'perhaps', 'maybe', 'likely', 'possibly',
      'i believe', 'appears to be'
    ];

    const lowerResponse = response.toLowerCase();
    for (const phrase of uncertainPhrases) {
      if (lowerResponse.includes(phrase)) {
        issues.push(`Response contains uncertain language: "${phrase}"`);
        break; // Only report first instance
      }
    }

    // Check if very few sources were used (less than 30% - warning level)
    // If only 3 of 7 sources are relevant, LLM should only cite those 3
    if (sources.length > 3 && seenIds.size < Math.ceil(sources.length * 0.3)) {
      issues.push(`Warning: Only ${seenIds.size} of ${sources.length} sources were cited (consider reviewing relevance)`);
    }

    return {
      isGrounded: issues.length === 0,
      missingCitations: citations.length === 0,
      issues
    };
  }

  /**
   * Build strict grounding prompt with context chunks
   */
  private buildStrictGroundingPrompt(
    chunks: ReferenceChunk[],
    userMessage: string,
    userQuestions: string[]
  ): string {
    // Format chunks with numbered citations
    const formattedChunks = chunks
      .map((chunk, index) => `[${index + 1}] (from "${chunk.sourceTitle}", chunk ${chunk.chunkIndex}):\n${chunk.content}`)
      .join('\n\n---\n\n');

    // Build contextual query from previous user questions
    const contextualQuery = userQuestions.length > 0
      ? `Previous questions:\n${userQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nCurrent question: ${userMessage}`
      : `Question: ${userMessage}`;

    return `${STRICT_GROUNDING_RULES}

${formattedChunks}

${contextualQuery}

ANSWER:`;
  }

  /**
   * Generate structured output with citations using tool calling
   * This ensures the response follows the expected schema
   */
  private async generateStructuredResponse(
    chunks: ReferenceChunk[],
    userMessage: string,
    userQuestions: string[]
  ): Promise<ChatResponse> {
    console.log('[ChatAgent] Generating structured response with citations');

    // Create a model with structured output
    // Note: TogetherAI supports structured output through tool/function calling
    // Using 'any' to avoid TypeScript deep instantiation errors
    const structuredLlm = (this.llm as any).withStructuredOutput(ChatResponseSchema, {
      name: 'chat_response',
    });

    const groundedPrompt = this.buildStrictGroundingPrompt(
      chunks,
      userMessage,
      userQuestions
    );

    const messages = [
      new SystemMessage(STRICT_GROUNDING_RULES),
      new HumanMessage(groundedPrompt)
    ];

    try {
      const response: any = await structuredLlm.invoke(messages);

      // Validate the response matches our schema
      const validated = ChatResponseSchema.safeParse(response);

      if (!validated.success) {
        console.warn('[ChatAgent] Structured output validation failed:', validated.error.errors);
        // Fallback: create a basic response from the raw output
        return {
          answer_markdown: String(response?.answer_markdown || response || ''),
          cited_indices: response?.cited_indices || [],
          confidence: response?.confidence || 'medium'
        };
      }

      console.log('[ChatAgent] Structured response generated successfully');
      console.log(`[ChatAgent] Citations: [${validated.data.cited_indices.join(', ')}], Confidence: ${validated.data.confidence}`);

      return validated.data;
    } catch (error) {
      console.error('[ChatAgent] Structured output generation failed:', error);
      // Fallback to empty response
      return {
        answer_markdown: 'I apologize, but I encountered an error generating a structured response.',
        cited_indices: [],
        confidence: 'low'
      };
    }
  }

  /**
   * Hybrid search (vector + keyword) with Cohere reranking
   * Uses Reciprocal Rank Fusion to combine semantic and lexical search
   */
  private async vectorSearch(
    userId: string,
    noteId: string,
    query: string,
    documentIds?: string[]
  ): Promise<ReferenceChunk[]> {
    // Validate document IDs if provided
    validateDocumentIds(documentIds);

    console.log(`[ChatAgent] hybridSearch: query="${query}"`);
    console.log(`[ChatAgent] params: threshold=${CHAT_CONFIG.VECTOR_MATCH_THRESHOLD}, count=${CHAT_CONFIG.VECTOR_MATCH_COUNT}`);

    const filterInfo = documentIds && documentIds.length > 0
      ? `filtering to ${documentIds.length} docs: ${documentIds.slice(0, 2).join(', ')}${documentIds.length > 2 ? '...' : ''}`
      : 'no document filter (all docs)';
    console.log(`[ChatAgent] docs: ${filterInfo}`);

    // Check chunk count for this user/note
    const { count: chunkCount } = await supabase
      .from('document_chunks')
      .select('document_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('note_id', noteId);
    console.log(`[ChatAgent] total chunks in DB: ${chunkCount ?? 0}`);

    // Check if chunks have embeddings
    const { count: chunksWithEmbeddings } = await supabase
      .from('document_chunks')
      .select('embedding', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('note_id', noteId)
      .not('embedding', 'is', null);
    console.log(`[ChatAgent] chunks with embeddings: ${chunksWithEmbeddings ?? 0}`);

    if (documentIds && documentIds.length > 0) {
      const { count: filteredChunkCount } = await supabase
        .from('document_chunks')
        .select('document_id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('note_id', noteId)
        .in('document_id', documentIds);
      console.log(`[ChatAgent] chunks in selected docs: ${filteredChunkCount ?? 0}`);

      const { count: filteredWithEmbeddings } = await supabase
        .from('document_chunks')
        .select('embedding', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('note_id', noteId)
        .in('document_id', documentIds)
        .not('embedding', 'is', null);
      console.log(`[ChatAgent] selected docs with embeddings: ${filteredWithEmbeddings ?? 0}`);
    }

    // Generate embedding for the original query
    const queryEmbedding = await this.embeddingService.embedText(query);

    // Execute hybrid search (vector + keyword with RRF)
    const { data, error } = await supabase.rpc('match_documents_hybrid', {
      query_embedding: queryEmbedding,
      query_text: query,
      user_id: userId,
      note_id: noteId,
      match_threshold: CHAT_CONFIG.VECTOR_MATCH_THRESHOLD,
      match_count: CHAT_CONFIG.VECTOR_MATCH_COUNT,
      document_ids: documentIds && documentIds.length > 0 ? documentIds : null,
      rrf_k: 60, // Standard RRF constant
    });

    if (error) {
      console.error(`[ChatAgent] Hybrid search RPC failed: ${error.message}`);
      throw new Error(`Hybrid search failed: ${error.message}. Please check your embeddings.`);
    }

    // If no results with document filter and we have chunks, try without filter to diagnose
    if (documentIds && documentIds.length > 0 && (!data || data.length === 0)) {
      console.warn(`[ChatAgent] No results with filter, trying WITHOUT filter for diagnosis...`);
      const { data: dataNoFilter } = await supabase.rpc('match_documents_hybrid', {
        query_embedding: queryEmbedding,
        query_text: query,
        user_id: userId,
        note_id: noteId,
        match_threshold: CHAT_CONFIG.VECTOR_MATCH_THRESHOLD,
        match_count: CHAT_CONFIG.VECTOR_MATCH_COUNT,
        document_ids: null,
        rrf_k: 60,
      });
      const noFilterCount = dataNoFilter?.length ?? 0;
      console.warn(`[ChatAgent] WITHOUT filter: ${noFilterCount} results`);
      if (noFilterCount > 0) {
        console.warn(`[ChatAgent] ISSUE: document_ids filter is blocking results!`);
      }
    }

    // Process results
    const allResults: ReferenceChunk[] = [];
    if (data && Array.isArray(data)) {
      for (const result of data as any[]) {
        allResults.push({
          id: 0, // Temporary ID, will be reassigned after deduplication
          sourceId: result.document_id,
          sourceTitle: result.title || result.file_name || 'Unknown Document',
          content: result.content,
          chunkIndex: result.chunk_index,
          similarity: result.similarity,
          rrfScore: result.rrf_score, // RRF score from hybrid search
          vectorRank: result.vector_rank,
          keywordRank: result.keyword_rank,
        });
      }
    }

    // Log RPC result summary with RRF scores
    const topScores = allResults.slice(0, 3).map(r => {
      const rrf = (r as any).rrfScore?.toFixed(4) || 'N/A';
      const vRank = (r as any).vectorRank || '-';
      const kRank = (r as any).keywordRank || '-';
      return `RRF:${rrf}(v:${vRank},k:${kRank})`;
    });
    console.log(`[ChatAgent] Hybrid search returned: ${allResults.length} results`);
    console.log(`[ChatAgent] Top 3 scores: [${topScores.join(', ') || 'none'}]`);

    // Deduplicate FIRST to reduce reranking payload
    const deduplicatedResults = this.deduplicateResults(allResults);
    console.log(`[ChatAgent] dedup: ${deduplicatedResults.length}`);

    // Rerank the deduplicated results (smaller payload = cheaper API call)
    const rerankedResults = await this.rerankResults(query, deduplicatedResults);

    // Limit to final results and reassign citation IDs
    const finalResults = rerankedResults.slice(0, CHAT_CONFIG.MAX_RESULTS).map((result, index) => ({
      ...result,
      id: index + 1,
    }));

    console.log(`[ChatAgent] final: ${finalResults.length} results`);

    if (finalResults.length === 0) {
      const reason = allResults.length === 0
        ? 'no matches above threshold'
        : 'all filtered by dedup/rerank';
      console.warn(`[ChatAgent] NO RESULTS: ${reason}`);
      throw new Error(`No results found in the ${documentIds?.length ?? 'all'} selected document(s). (${reason})`);
    }

    return finalResults;
  }

  /**
   * Rerank results using Cohere with retry logic for rate limits
   */
  private async rerankResults(query: string, results: ReferenceChunk[]): Promise<ReferenceChunk[]> {
    if (!env.COHERE_API_KEY || results.length <= CHAT_CONFIG.RERANK_THRESHOLD) {
      console.log(`[ChatAgent] Skipping reranking: only ${results.length} results`);
      return results;
    }

    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { CohereRerank } = await import('@langchain/cohere');
        const reranker = new CohereRerank({
          apiKey: env.COHERE_API_KEY,
          model: env.COHERE_RERANK_MODEL,
          topN: CHAT_CONFIG.RERANK_TOP_N,
        });

        const documents = results.map(r => ({
          pageContent: r.content,
          metadata: { sourceId: r.sourceId, sourceTitle: r.sourceTitle },
        }));

        console.log(`[ChatAgent] Reranking attempt ${attempt + 1}/${maxRetries}...`);
        const rerankedDocs = await reranker.compressDocuments(documents, query);
        const resultMap = new Map(results.map(r => [r.content, r]));

        const rerankedResults: ReferenceChunk[] = [];
        for (const doc of rerankedDocs) {
          const original = resultMap.get(doc.pageContent);
          if (original) {
            rerankedResults.push(original);
          }
        }

        // Add any results that weren't reranked
        for (const result of results) {
          if (!rerankedResults.includes(result)) {
            rerankedResults.push(result);
          }
        }

        console.log(`[ChatAgent] Successfully reranked ${rerankedResults.length} documents`);
        return rerankedResults;
      } catch (error: any) {
        const isRateLimitError = error?.statusCode === 429 || error?.status === 429;
        const isLastAttempt = attempt === maxRetries - 1;

        if (isRateLimitError && !isLastAttempt) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = baseDelay * Math.pow(2, attempt);
          console.warn(`[ChatAgent] Rate limit hit (429), retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Log the error details
        console.error(`[ChatAgent] Reranking failed after ${attempt + 1} attempt(s):`, {
          message: error?.message,
          status: error?.statusCode || error?.status,
          isRateLimit: isRateLimitError,
        });

        // Fall back to original order
        console.log(`[ChatAgent] Falling back to hybrid search (RRF) order`);
        return results;
      }
    }

    // Should never reach here, but just in case
    console.log(`[ChatAgent] Exhausted retries, using original order`);
    return results;
  }

  /**
   * Remove exact and near-duplicate chunks using diversity checks
   * Prevents adjacent chunks from same document from dominating results
   */
  private deduplicateResults(results: ReferenceChunk[]): ReferenceChunk[] {
    const seen = new Set<string>();
    const diverse: ReferenceChunk[] = [];

    for (const result of results) {
      const key = `${result.sourceId}-${result.chunkIndex}`;

      // Check exact duplicates
      if (seen.has(key)) continue;
      seen.add(key);

      // Check for adjacent chunks from same document (likely near-duplicates)
      const adjacentChunk = diverse.find(
        existing =>
          existing.sourceId === result.sourceId &&
          Math.abs(existing.chunkIndex - result.chunkIndex) === 1
      );

      if (adjacentChunk) {
        // Compare RRF scores - only replace if significantly better (>20% improvement)
        const currentScore = (result as any).rrfScore || 0;
        const existingScore = (adjacentChunk as any).rrfScore || 0;

        if (currentScore > existingScore * 1.2) {
          // Replace with better-scoring adjacent chunk
          const index = diverse.indexOf(adjacentChunk);
          diverse.splice(index, 1, result);
        }
        // Skip adding this chunk (we have the adjacent one)
        continue;
      }

      diverse.push(result);
    }

    console.log(`[ChatAgent] Deduplication: ${results.length} → ${diverse.length} (removed ${results.length - diverse.length} near-duplicates)`);
    return diverse;
  }

  /**
   * Stream response using strict RAG pattern (retrieve first, then generate)
   * This eliminates agentic decision-making and ensures grounding
   */
  async *streamResponse(
    context: ChatAgentContext,
    userMessage: string
  ): AsyncGenerator<StreamChunk> {
    console.log('[ChatAgent] ========== STREAM START (Strict RAG) ==========');
    console.log(`[ChatAgent] User message: "${userMessage}"`);
    console.log(`[ChatAgent] Context: userId=${context.userId}, noteId=${context.noteId}`);

    try {
      // ============================================================
      // PHASE 1: Retrieval (deterministic, no LLM decision)
      // ============================================================

      console.log('[ChatAgent] Phase 1: Retrieving relevant documents');
      yield { type: 'status', status: 'searching', message: 'Searching relevant sources...' };

      const chunks = await this.vectorSearch(
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
      const structuredResponse = await this.generateStructuredResponse(
        chunks,
        userMessage,
        [] // Empty array - no conversation context in generation
      );

      // Yield the answer as tokens for compatibility with existing streaming interface
      yield { type: 'status', status: 'generating', message: 'Generating response...' };
      // Note: This is no longer true streaming, but chunked output for UI compatibility
      const answerText = structuredResponse.answer_markdown;
      const chunkSize = 50; // Send in chunks to simulate streaming

      for (let i = 0; i < answerText.length; i += chunkSize) {
        const chunk = answerText.slice(i, i + chunkSize);
        yield { type: 'token', data: chunk };
      }

      console.log(`[ChatAgent] Generated response length: ${answerText.length} characters`);
      console.log(`[ChatAgent] Cited indices: [${structuredResponse.cited_indices.join(', ')}], Confidence: ${structuredResponse.confidence}`);

      // ============================================================
      // PHASE 3: Validation
      // ============================================================

      console.log('[ChatAgent] Phase 3: Validating grounding');

      const validation = this.validateGrounding(answerText, chunks);

      if (!validation.isGrounded) {
        console.warn(`[ChatAgent] Grounding validation failed: ${validation.issues.join(', ')}`);
        yield {
          type: 'grounding_check',
          data: {
            passed: false,
            issues: validation.issues,
            message: 'Note: This response may not be fully grounded in your documents'
          }
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
            issues: structuredResponse.confidence === 'low'
              ? ['Low confidence in source coverage']
              : [],
            message: `Response confidence: ${structuredResponse.confidence}`
          }
        };
      }

      yield { type: 'done' };

      console.log(`[ChatAgent] ========== STREAM COMPLETE ==========`);
      console.log(`[ChatAgent] Response: ${answerText.length} chars, Sources: ${chunks.length}, Validation: ${validation.isGrounded ? 'PASSED' : 'FAILED'}`);
    } catch (error) {
      console.error('[ChatAgent] ========== ERROR ==========');
      console.error('[ChatAgent] Error:', error);

      // Classify error types for better user messaging
      let errorMessage = 'Unknown error occurred';
      let errorType = 'unknown';

      if (error instanceof Error) {
        errorMessage = error.message;

        // Classify common errors
        if (error.message.includes('No results found') || error.message.includes('No relevant documents')) {
          errorType = 'no_documents';
        } else if (error.message.includes('Vector search failed') || error.message.includes('Hybrid search failed')) {
          errorType = 'search_failed';
        } else if (error.message.includes('API key')) {
          errorType = 'api_error';
        } else if (error.message.includes('Invalid document IDs')) {
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

import { tool } from 'langchain';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { supabase } from '../../config/database.js';
import { env } from '../../config/env.js';
import { EmbeddingService } from '../processing/EmbeddingService.js';
import type { ReferenceChunk } from '../storage/ChatHistoryService.js';

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
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw new Error(`Invalid document IDs: ${errorDetails}`);
    }
  }
}

// ============================================================
// Configuration
// ============================================================

const CHAT_CONFIG = {
  TEMPERATURE: parseFloat(env.CHAT_LLM_TEMPERATURE ?? '0.7'),
  MAX_HISTORY_MESSAGES: parseInt(env.CHAT_MAX_HISTORY_MESSAGES ?? '20', 10),
  VECTOR_MATCH_THRESHOLD: parseFloat(env.CHAT_VECTOR_MATCH_THRESHOLD ?? '0.5'),
  VECTOR_MATCH_COUNT: parseInt(env.CHAT_VECTOR_MATCH_COUNT ?? '10', 10),
  RERANK_THRESHOLD: parseInt(env.CHAT_RERANK_THRESHOLD ?? '3', 10),
  MAX_RESULTS: parseInt(env.CHAT_MAX_RESULTS ?? '20', 10),
  QUERY_VARIANTS_MAX: parseInt(env.CHAT_QUERY_VARIANTS_MAX ?? '5', 10),
  DOCUMENT_MAX_CHARS: parseInt(env.CHAT_DOCUMENT_MAX_CHARS ?? '3000', 10),
} as const;

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
  type: 'token' | 'references' | 'done' | 'error' | 'warning';
  data?: any;
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
   * Create tools for the agent using the new tool() helper
   * Using 'any' to avoid deep type instantiation errors
   */
  private createTools(context: ChatAgentContext): any[] {
    const searchTool = tool(
      async ({ query }: { query: string }): Promise<string> => {
        console.log(`[Tool] Searching for: "${query}"`);
        const chunks = await this.vectorSearch(
          context.userId,
          context.noteId,
          query,
          context.documentIds
        );
        console.log(`[Tool] Found ${chunks.length} relevant chunks`);
        return JSON.stringify(chunks);
      },
      {
        name: 'search_document_database',
        description: 'Search documents for relevant passages. Returns array of {id: number, content: string, sourceTitle: string}. Use the id for citations like [1], [2], [3].',
        schema: z.object({
          query: z.string().describe('The search query from the user'),
        }),
      } as any
    );

    const listTool = tool(
      async (): Promise<string> => {
        console.log('[Tool] Listing available documents');
        const docs = await this.listDocuments(context.userId, context.noteId);
        console.log(`[Tool] Found ${docs.length} documents`);
        return JSON.stringify(docs);
      },
      {
        name: 'list_available_documents',
        description: 'Get a list of all documents available in the user\'s notebook. Use this when you need to know what documents the user has uploaded.',
        schema: z.object({}), // No input needed
      } as any
    );

    const summaryTool = tool(
      async ({ documentId }: { documentId: string }): Promise<string> => {
        console.log(`[Tool] Getting summary for document: ${documentId}`);
        return await this.getDocumentSummary(documentId, context.userId);
      },
      {
        name: 'get_document_summary',
        description: 'Get a pre-generated summary of a specific document by ID. Use this when you need a high-level overview of a document.',
        schema: z.object({
          documentId: z.string().describe('Document UUID'),
        }),
      } as any
    );

    return [searchTool, listTool, summaryTool];
  }

  /**
   * Vector search with Cohere reranking
   */
  private async vectorSearch(
    userId: string,
    noteId: string,
    query: string,
    documentIds?: string[]
  ): Promise<ReferenceChunk[]> {
    // Validate document IDs if provided
    validateDocumentIds(documentIds);

    console.log(`[ChatAgent] vectorSearch: query="${query}"`);
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

    // Execute search
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      user_id: userId,
      note_id: noteId,
      match_threshold: CHAT_CONFIG.VECTOR_MATCH_THRESHOLD,
      match_count: CHAT_CONFIG.VECTOR_MATCH_COUNT,
      document_ids: documentIds && documentIds.length > 0 ? documentIds : null,
    });

    if (error) {
      console.error(`[ChatAgent] RPC failed: ${error.message}`);
      throw new Error(`Vector search failed: ${error.message}. Please check your embeddings.`);
    }

    // If no results with document filter and we have chunks, try without filter to diagnose
    if (documentIds && documentIds.length > 0 && (!data || data.length === 0)) {
      console.warn(`[ChatAgent] No results with filter, trying WITHOUT filter for diagnosis...`);
      const { data: dataNoFilter } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        user_id: userId,
        note_id: noteId,
        match_threshold: CHAT_CONFIG.VECTOR_MATCH_THRESHOLD,
        match_count: CHAT_CONFIG.VECTOR_MATCH_COUNT,
        document_ids: null,
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
        });
      }
    }

    // Log RPC result summary with similarity scores
    const topSimilarities = allResults.slice(0, 3).map(r => (r.similarity ?? 0).toFixed(3));
    console.log(`[ChatAgent] RPC returned: ${allResults.length} results, top similarities: [${topSimilarities.join(', ') || 'none'}]`);

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
   * Rerank results using Cohere
   */
  private async rerankResults(query: string, results: ReferenceChunk[]): Promise<ReferenceChunk[]> {
    if (!env.COHERE_API_KEY || results.length <= CHAT_CONFIG.RERANK_THRESHOLD) {
      console.log(`[ChatAgent] Skipping reranking: only ${results.length} results`);
      return results;
    }

    try {
      const { CohereRerank } = await import('@langchain/cohere');
      const reranker = new CohereRerank({
        apiKey: env.COHERE_API_KEY,
        model: env.COHERE_RERANK_MODEL,
        topN: Math.min(results.length, 15),
      });

      const documents = results.map(r => ({
        pageContent: r.content,
        metadata: { sourceId: r.sourceId, sourceTitle: r.sourceTitle },
      }));

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

      console.log(`[ChatAgent] Reranked ${rerankedResults.length} documents`);
      return rerankedResults;
    } catch (error) {
      console.error('[ChatAgent] Reranking failed, using original order:', error);
      return results;
    }
  }

  /**
   * Deduplicate results by document ID and chunk index
   */
  private deduplicateResults(results: ReferenceChunk[]): ReferenceChunk[] {
    const seen = new Set<string>();
    return results.filter(r => {
      const key = `${r.sourceId}-${r.chunkIndex}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * List all documents in the notebook
   */
  private async listDocuments(userId: string, noteId: string) {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, file_name, file_type, status')
      .eq('user_id', userId)
      .eq('note_id', noteId);

    if (error) {
      console.error('[ChatAgent] Error listing documents:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get document summary from chunks
   */
  private async getDocumentSummary(documentId: string, userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('document_chunks')
      .select('content')
      .eq('document_id', documentId)
      .eq('user_id', userId)
      .order('chunk_index', { ascending: true })
      .limit(3);

    if (error) {
      console.error('[ChatAgent] Error getting document summary:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return 'No content available for this document.';
    }

    const summary = data.map(d => d.content).join('\n\n---\n\n');
    return summary.substring(0, CHAT_CONFIG.DOCUMENT_MAX_CHARS) + (summary.length > CHAT_CONFIG.DOCUMENT_MAX_CHARS ? '...' : '');
  }

  /**
   * Stream agent response using direct tool calling loop
   */
  async *streamResponse(
    context: ChatAgentContext,
    userMessage: string
  ): AsyncGenerator<StreamChunk> {
    console.log('[ChatAgent] ========== STREAM START ==========');
    console.log(`[ChatAgent] User message: "${userMessage}"`);
    console.log(`[ChatAgent] Context: userId=${context.userId}, noteId=${context.noteId}`);

    try {
      const tools = this.createTools(context);
      console.log(`[ChatAgent] Created ${tools.length} tools: ${tools.map((t: any) => t.name).join(', ')}`);

      // Bind tools to model
      const boundModel = this.llm.bindTools(tools as any);
      console.log(`[ChatAgent] Tools bound to model`);

      const systemPrompt = `You are a research assistant helping users understand their uploaded documents.

IMPORTANT: The user's question has already been searched and relevant document passages have been retrieved. You MUST use these search results to answer.

Your task is to:
1. Read the search results that have been provided
2. Answer the user's question using ONLY information from the search results
3. Use inline citations like [1], [2], [3] after each fact - the numbers match the "id" field in the search results
4. Write natural language prose

If the search results don't contain information relevant to the question, say: "I couldn't find information about this in your documents."

Do NOT make up information. Do NOT use external knowledge. Only use what's in the search results provided.`;

      // Build messages - keep minimal history (last 2 exchanges) to avoid "laziness"
      // while maintaining conversation context
      const recentHistory = context.conversationHistory.slice(-4); // Last 2 AI + 2 human messages

      let messages: (HumanMessage | AIMessage | SystemMessage | ToolMessage)[] = [
        new SystemMessage(systemPrompt),
        ...recentHistory.map(msg =>
          msg.role === 'user'
            ? new HumanMessage(msg.content)
            : new AIMessage(msg.content)
        ),
        new HumanMessage(userMessage),
      ];

      console.log(`[ChatAgent] Total messages: ${messages.length}`);

      // Force execute search first - this bypasses the LLM's decision to search or not
      console.log(`[ChatAgent] Force-executing search for: "${userMessage}"`);
      const searchTool = tools.find((t: any) => t.name === 'search_document_database');
      if (!searchTool) {
        throw new Error('search_document_database tool not found');
      }

      let collectedReferences: ReferenceChunk[] = [];
      let toolIteration = 0;
      const MAX_TOOL_ITERATIONS = 5;

      // Execute search automatically (no LLM decision needed)
      try {
        const searchResult = await searchTool.invoke({ query: userMessage });
        console.log(`[ChatAgent] Auto-search result length: ${searchResult?.length || 0}`);
        const chunks = JSON.parse(searchResult);
        if (Array.isArray(chunks)) {
          collectedReferences.push(...chunks);
          console.log(`[ChatAgent] Auto-search collected ${chunks.length} references`);
        }
        // Add the tool result to messages
        messages.push(new ToolMessage(searchResult, searchTool.name));
      } catch (error) {
        console.error('[ChatAgent] Auto-search failed:', error);
        // If search fails, let the LLM handle it
        yield { type: 'error', data: { message: 'Search failed. Please try again.', type: 'search_failed' } };
        return;
      }

      // Now let the LLM respond using the search results
      while (toolIteration < MAX_TOOL_ITERATIONS) {
        toolIteration++;
        console.log(`[ChatAgent] Tool iteration ${toolIteration}/${MAX_TOOL_ITERATIONS}`);

        // Call model and stream response
        const response = await boundModel.invoke(messages);

        // Add assistant response to messages
        messages.push(response);

        // Check for tool calls in standard location or additional_kwargs
        const toolCalls = response.tool_calls || response.additional_kwargs?.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
          console.log(`[ChatAgent] No tool calls, streaming final response`);
          // Stream the final response content
          const content = response.content as string;
          if (content && !this.isArtifactContent(content)) {
            yield { type: 'token', data: content };
          }
          break;
        }

        // Execute tool calls
        console.log(`[ChatAgent] Executing ${toolCalls.length} tool calls`);
        for (const toolCall of toolCalls) {
          const toolName = (toolCall as any).name || toolCall.id?.split('_')[0];
          const toolArgs = (toolCall as any).args;
          console.log(`[ChatAgent] Calling tool: ${toolName} with args:`, JSON.stringify(toolArgs).substring(0, 200));

          // Find and execute the tool
          const tool = tools.find((t: any) => t.name === toolName);
          if (!tool) {
            console.error(`[ChatAgent] Tool not found: ${toolName}`);
            continue;
          }

          try {
            const toolResult = await tool.invoke(toolArgs);
            console.log(`[ChatAgent] Tool ${toolName} returned, result length: ${toolResult?.length || 0}`);

            // Collect references from search results
            if (toolName === 'search_document_database') {
              try {
                const chunks = JSON.parse(toolResult);
                if (Array.isArray(chunks)) {
                  collectedReferences.push(...chunks);
                  console.log(`[ChatAgent] Collected ${chunks.length} references`);
                }
              } catch {
                console.warn(`[ChatAgent] Could not parse search results as JSON`);
              }
            }

            // Add tool result message
            messages.push(new ToolMessage(toolResult, toolCall.id || toolName));
          } catch (error) {
            console.error(`[ChatAgent] Tool execution error:`, error);
            messages.push(new ToolMessage(`Error: ${error}`, toolCall.id || toolName));
          }
        }
      }

      // Send references at the end
      if (collectedReferences.length > 0) {
        yield { type: 'references', data: collectedReferences };
      }

      yield { type: 'done' };

      console.log(`[ChatAgent] ========== STREAM COMPLETE ==========`);
      console.log(`[ChatAgent] Tool iterations: ${toolIteration}, Refs: ${collectedReferences.length}`);
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
        } else if (error.message.includes('Vector search failed')) {
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

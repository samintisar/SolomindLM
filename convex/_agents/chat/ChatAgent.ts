"use node";
/**
 * Chat Agent Service
 *
 * Deterministic router → parallel sub-query retrieval (HyDE + hybrid, rerank once) → structured answer.
 */

import { env } from "../../_lib/env";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import type { ServiceLogger } from "../../_lib/logging/serviceLogger";

import { VectorSearchHandler } from "./vector_search.js";
import { ChatLLMWrapper, type ChatResponse } from "./llm_wrapper.js";
import { validateGrounding, validateSemanticGrounding } from "./grounding_validator.js";
import { EmbeddingService } from "../../_services/processing/EmbeddingServiceClient";
import type { ReferenceChunk } from "../../storage/ChatHistoryService";
import { budgetConversationHistory } from "./chatHistoryBudget.js";
import { routeChatMessage } from "./chatRouter.js";

import type { ChatAgentContext, ChatAgentOptions, GlobalRerankFn, StreamChunk } from "./types.js";
import { countTokens } from "../_shared/tokenizer";
import {
  CONTEXT_TOKEN_BUDGET,
  FOLLOWUP_GENERATION_TIMEOUT_MS,
  LIST_QUERY_CONTEXT_TOKEN_BUDGET,
  LIST_QUERY_MAX_SELECTED_CHUNKS,
  MAX_CHUNKS_HARD_LIMIT,
  SEARCH_PIPELINE_TIMEOUT_MS,
  STREAM_TOKEN_DELAY_MS,
} from "./chatConfig.js";
import { withTimeout } from "./withTimeout.js";
import {
  chunkDedupKey,
  chunkRankingScore,
  mergeChunkScores,
  selectChunksByTokenBudgetWithReservation,
} from "./chunkContext.js";
import { isListEnumerationQuery } from "./chat_retrieval_subqueries.js";
/**

 * Threshold for when to use full-document mode.
 * If retrieved chunks represent more than this fraction of a document's total chunks,
 * fetch the full document instead.
 */
const FULL_DOCUMENT_CHUNK_RATIO_THRESHOLD = 0.4;
import { expandQueryWithKeywords } from "./queryExpansion.js";
import { sliceParagraphForStream } from "./streamSlice.js";

export class ChatAgent {
  private llmWrapper: ChatLLMWrapper;
  private vectorSearch: VectorSearchHandler;
  private embeddingService: EmbeddingService;
  private globalRerankFn?: GlobalRerankFn;
  private fetchDocumentFn?: ChatAgentOptions["fetchDocumentFn"];

  constructor(options?: ChatAgentOptions) {
    const smartModel = options?.smartModel || env.SMART_LLM || "openai/gpt-oss-120b";
    this.llmWrapper = new ChatLLMWrapper({
      apiKey: env.TOGETHER_AI_API_KEY,
      model: smartModel,
      temperature: parseFloat(env.CHAT_LLM_TEMPERATURE ?? "0.1"),
      fastModel: env.FAST_LLM,
      fastApiKey: env.TOGETHER_AI_API_KEY,
      outputLanguage: options?.outputLanguage,
    });

    this.vectorSearch =
      options?.vectorSearchHandler ??
      new VectorSearchHandler({
        vectorMatchThreshold: parseFloat(env.CHAT_VECTOR_MATCH_THRESHOLD ?? "0.3"),
        vectorMatchCount: parseInt(env.CHAT_VECTOR_MATCH_COUNT ?? "25", 10),
        rerankThreshold: parseInt(env.CHAT_RERANK_THRESHOLD ?? "5", 10),
        rerankTopN: parseInt(env.CHAT_RERANK_TOP_N ?? "15", 10),
        maxResults: parseInt(env.CHAT_MAX_RESULTS ?? "7", 10),
      });

    this.embeddingService = new EmbeddingService(env.TOGETHER_AI_API_KEY);
    this.globalRerankFn = options?.globalRerankFn;
    this.fetchDocumentFn = options?.fetchDocumentFn;
  }

  /**
   * Fetch full document content
   */
  private async fetchFullDocumentContent(
    documentId: string
  ): Promise<{ content: string; title?: string; sourceUrl?: string } | null> {
    if (!this.fetchDocumentFn) return null;
    try {
      const result = await this.fetchDocumentFn(documentId);
      if (!result?.content?.trim()) return null;
      return {
        content: result.content,
        title: result.title,
        sourceUrl: result.sourceUrl,
      };
    } catch {
      return null;
    }
  }

  /**
   * GENERAL MULTI-SECTION DOCUMENT RETRIEVAL:
   * When retrieval finds multiple relevant sections from the same document,
   * replace those chunks with the full document content.
   *
   * This ensures comprehensive coverage when the query relates to many parts
   * of a single source, regardless of query type.
   *
   * @param chunks - All retrieved chunks after reranking
   * @param logger - Service logger
   * @returns Chunks with multi-section documents replaced by full content
   */
  private async expandMultiSectionDocuments(
    chunks: ReferenceChunk[],
    logger: ServiceLogger
  ): Promise<ReferenceChunk[]> {
    if (!this.fetchDocumentFn || chunks.length === 0) return chunks;

    // Group chunks by document
    const chunksByDocument = new Map<string, ReferenceChunk[]>();
    for (const chunk of chunks) {
      const docId = chunk.documentId;
      if (!docId) continue;

      if (!chunksByDocument.has(docId)) {
        chunksByDocument.set(docId, []);
      }
      chunksByDocument.get(docId)!.push(chunk);
    }

    // Find documents with many chunks retrieved
    const documentsToExpand: string[] = [];
    for (const [docId, docChunks] of chunksByDocument) {
      const totalChunks = docChunks[0]?.metadata?.totalChunks ?? 1;
      const retrievedCount = docChunks.length;
      const ratio = retrievedCount / totalChunks;

      // Expand if we have a significant portion of the document
      // OR if we have many chunks regardless of document size
      const shouldExpand = ratio >= FULL_DOCUMENT_CHUNK_RATIO_THRESHOLD || retrievedCount >= 10; // Absolute threshold for larger documents

      if (shouldExpand && totalChunks > 1) {
        documentsToExpand.push(docId);
        logger.info("Expanding multi-section document to full content", {
          documentId: docId,
          retrievedCount,
          totalChunks,
          ratio: ratio.toFixed(2),
        });
      }
    }

    if (documentsToExpand.length === 0) return chunks;

    // Fetch full content for documents to expand
    const expandedChunks: ReferenceChunk[] = [];
    const expandedDocIds = new Set<string>(documentsToExpand);

    for (const chunk of chunks) {
      const docId = chunk.documentId;

      if (docId && expandedDocIds.has(docId)) {
        // Only add full document once per document
        if (!expandedChunks.some((c) => c.documentId === docId && c.chunkIndex === -1)) {
          const loaded = await this.fetchFullDocumentContent(docId);
          if (loaded) {
            expandedChunks.push({
              id: `full-${docId}`,
              sourceId: String(docId),
              documentId: docId,
              sourceTitle: chunk.sourceTitle,
              sourceUrl: chunk.sourceUrl,
              content: loaded.content,
              chunkIndex: -1, // Special index to indicate full document
              similarity: 1.0,
              metadata: {
                totalChunks: chunksByDocument.get(docId)!.length,
                relativePosition: 0.5,
                chunkLengthChars: loaded.content.length,
                wordCount: loaded.content.split(/\s+/).length,
                sentenceCount: loaded.content.split(/[.!?]+/).length,
              },
            });
          }
        }
      } else {
        // Keep chunks from documents not being expanded
        expandedChunks.push(chunk);
      }
    }

    logger.info("Multi-section document expansion complete", {
      originalChunks: chunks.length,
      expandedChunks: expandedChunks.length,
      documentsExpanded: documentsToExpand.length,
    });

    return expandedChunks;
  }

  private createLogger(context: ChatAgentContext & { requestId?: string }): ServiceLogger {
    return createServiceLogger("ChatAgent", "streamChatResponse", {
      userId: context.userId,
      notebookId: context.noteId,
      requestId: context.requestId,
    });
  }

  private resolveGroundingMode(context: ChatAgentContext): "async" | "sync" | "off" {
    if (context.groundingMode) return context.groundingMode;
    const m = env.CHAT_GROUNDING_MODE;
    if (m === "sync" || m === "off") return m;
    return "async";
  }

  /**
   * HyDE + hybrid search for one sub-query; rerank skipped (merged + global rerank later).
   */
  private async runSubqueryRetrieval(
    query: string,
    context: ChatAgentContext,
    logger: ServiceLogger,
    isListQuery: boolean = false
  ): Promise<ReferenceChunk[]> {
    const pipelineDeadline = Date.now() + SEARCH_PIPELINE_TIMEOUT_MS;
    const remainingMs = () => {
      const ms = pipelineDeadline - Date.now();
      if (ms <= 0) {
        throw new Error(`search_pipeline timed out after ${SEARCH_PIPELINE_TIMEOUT_MS}ms`);
      }
      return ms;
    };

    const searchOpts = { skipRerank: true, allowEmpty: true, isListQuery } as const;

    logger.apiCall("ChatLLMWrapper", "generateHypotheticalDocument", { query });
    const hydeText = await withTimeout(
      this.llmWrapper.generateHypotheticalDocument(query),
      remainingMs(),
      "hyde_generation"
    );

    const textForVectorEmbedding = [query.trim(), hydeText.trim()].filter(Boolean).join("\n\n");
    const hydeEmbedding = await withTimeout(
      this.embeddingService.embedText(textForVectorEmbedding),
      remainingMs(),
      "hyde_embedding"
    );

    if (context.documentIds?.length) {
      const expandedQueries = expandQueryWithKeywords(query);
      const allResults: ReferenceChunk[] = [];
      const seenChunkKeys = new Set<string>();

      for (const queryVariation of expandedQueries) {
        const variationResults = await withTimeout(
          this.vectorSearch.search(
            context.userId,
            context.noteId,
            queryVariation,
            context.documentIds,
            hydeEmbedding,
            hydeText,
            searchOpts
          ),
          remainingMs(),
          "vector_hybrid_search"
        );
        for (const chunk of variationResults) {
          const key = chunkDedupKey(chunk);
          if (!seenChunkKeys.has(key)) {
            allResults.push(chunk);
            seenChunkKeys.add(key);
          }
        }
      }
      logger.apiSuccess(
        "VectorSearch",
        "hybrid",
        Date.now() - (pipelineDeadline - SEARCH_PIPELINE_TIMEOUT_MS),
        {
          query,
          expandedCount: expandedQueries.length,
          resultCount: allResults.length,
        }
      );
      return allResults;
    }

    const results = await withTimeout(
      this.vectorSearch.search(
        context.userId,
        context.noteId,
        query,
        context.documentIds,
        hydeEmbedding,
        hydeText,
        searchOpts
      ),
      remainingMs(),
      "vector_hybrid_search"
    );
    logger.apiSuccess(
      "VectorSearch",
      "hybrid",
      Date.now() - (pipelineDeadline - SEARCH_PIPELINE_TIMEOUT_MS),
      {
        query,
        resultCount: results.length,
      }
    );
    return results;
  }

  private async applyGlobalRerank(
    merged: ReferenceChunk[],
    rerankQueryFromDecomposer: string | undefined,
    userMessage: string,
    logger: ServiceLogger
  ): Promise<ReferenceChunk[]> {
    if (!this.globalRerankFn || merged.length === 0) {
      return merged;
    }
    const rerankQueryForCache =
      (rerankQueryFromDecomposer?.trim() && rerankQueryFromDecomposer.trim()) || userMessage;

    const docs = merged.map((c) => ({
      id: `${c.sourceId}:${c.chunkIndex}`,
      content: c.content,
    }));

    const rerankStart = Date.now();
    try {
      const reranked = await this.globalRerankFn(rerankQueryForCache, docs);
      const order = new Map(reranked.map((d, i) => [d.id, i]));
      const scoreMap = new Map(reranked.map((d) => [d.id, d.score]));

      logger.apiSuccess("Rerank", "global", Date.now() - rerankStart, {
        inputCount: merged.length,
        outputCount: reranked.length,
      });

      const sorted = [...merged].sort((a, b) => {
        const ida = `${a.sourceId}:${a.chunkIndex}`;
        const idb = `${b.sourceId}:${b.chunkIndex}`;
        const ia = order.has(ida) ? (order.get(ida) as number) : 9999;
        const ib = order.has(idb) ? (order.get(idb) as number) : 9999;
        if (ia !== ib) return ia - ib;
        return chunkRankingScore(b) - chunkRankingScore(a);
      });

      return sorted.map((c) => {
        const id = `${c.sourceId}:${c.chunkIndex}`;
        const sc = scoreMap.get(id);
        if (sc != null && !Number.isNaN(sc)) {
          return { ...c, similarity: sc };
        }
        return c;
      });
    } catch (error) {
      logger.apiError("Rerank", "global", error, { inputCount: merged.length });
      throw error;
    }
  }

  async *streamResponse(
    context: ChatAgentContext,
    userMessage: string,
    requestId?: string
  ): AsyncGenerator<StreamChunk> {
    const logger = this.createLogger({ ...context, requestId });

    logger.operationStart({ userMessage, documentIds: context.documentIds });

    try {
      const historyBudget = parseInt(env.CHAT_HISTORY_TOKEN_BUDGET ?? "4000", 10);
      const recentTurns = budgetConversationHistory(context.conversationHistory, historyBudget);

      yield* this.streamRoutedResponse(context, userMessage, recentTurns, logger);

      logger.operationComplete();
    } catch (error) {
      logger.operationError(error, { userMessage });

      let errorMessage = "Unknown error occurred";
      let errorType = "unknown";

      if (error instanceof Error) {
        errorMessage = error.message;
        if (
          error.message.includes("No results found") ||
          error.message.includes("No relevant documents")
        ) {
          errorType = "no_documents";
        } else if (
          error.message.includes("Vector search failed") ||
          error.message.includes("Hybrid search failed")
        ) {
          errorType = "search_failed";
        } else if (error.message.includes("API key")) {
          errorType = "api_error";
        } else if (error.message.includes("Invalid document ID")) {
          errorType = "validation_error";
        } else if (error.message.includes("timed out")) {
          errorType = "timeout";
        }
      }

      yield { type: "error", data: { message: errorMessage, type: errorType } };
    }
  }

  private async *streamRoutedResponse(
    context: ChatAgentContext,
    userMessage: string,
    recentTurns: Array<{ role: string; content: string }>,
    logger: ServiceLogger
  ): AsyncGenerator<StreamChunk> {
    // Default mode: treat every query as standalone — no conversation memory.
    // Learning guide mode keeps full history for Socratic back-and-forth.
    const effectiveTurns =
      context.chatSettings?.instructionMode === "learningGuide" ? recentTurns : [];

    const route = routeChatMessage(userMessage, effectiveTurns, context.chatSettings);

    if (route.type === "clarify") {
      logger.info("Router decision: clarify", { question: route.question });
      yield { type: "clarification", data: { question: route.question } };
      yield { type: "done" };
      return;
    }

    if (route.type === "direct") {
      logger.info("Router decision: direct response");
      yield { type: "status", status: "thinking", message: "Generating response..." };
      const directAnswer = await this.llmWrapper.generateDirectResponse(
        userMessage,
        effectiveTurns,
        context.chatSettings
      );
      for (const para of directAnswer.split(/\n\n+/)) {
        if (para.trim().length > 0) {
          for await (const piece of sliceParagraphForStream(para)) {
            yield { type: "token", data: piece };
            await new Promise((resolve) => setTimeout(resolve, STREAM_TOKEN_DELAY_MS));
          }
        }
      }
      yield { type: "done" };
      return;
    }

    logger.info("Router decision: retrieve (parallel sub-queries)");
    const enableNotebookSearch = context.enableNotebookSearch !== false;
    const isListQuery = isListEnumerationQuery(userMessage);
    const allChunks: ReferenceChunk[] = [];
    let rerankQueryOpt: string | undefined;

    // Fetch full content for attached documents (via @mentions) and add them as chunks
    if (context.attachedDocumentIds && context.attachedDocumentIds.length > 0) {
      logger.info("Fetching full content for attached documents", {
        count: context.attachedDocumentIds.length,
        documentIds: context.attachedDocumentIds,
      });
      for (const docId of context.attachedDocumentIds) {
        const loaded = await this.fetchFullDocumentContent(docId);
        if (loaded) {
          const { content: fullText, title: docTitle, sourceUrl: docUrl } = loaded;
          // Log first 200 chars to identify which doc was fetched
          logger.info("Attached document fetched", {
            documentId: docId,
            contentPreview: fullText.slice(0, 200).replace(/\n/g, " "),
            contentLength: fullText.length,
          });
          const displayTitle = (docTitle ?? "").trim() || "Attached document";
          allChunks.push({
            id: `full-${docId}`,
            sourceId: String(docId),
            documentId: docId,
            sourceTitle: displayTitle,
            ...(docUrl ? { sourceUrl: docUrl } : {}),
            content: fullText,
            chunkIndex: -1,
            similarity: 1.0,
            metadata: {
              totalChunks: 1,
              relativePosition: 0.5,
              chunkLengthChars: fullText.length,
              wordCount: fullText.split(/\s+/).length,
              sentenceCount: fullText.split(/[.!?]+/).length,
              userAttached: true,
            },
          });
        } else {
          logger.warn("Failed to fetch attached document", { documentId: docId });
        }
      }
      logger.info("Attached documents loaded", {
        loadedCount: allChunks.length,
      });
    }

    // Exclude attached documents from RAG search since their full content
    // is already injected above — avoids misleading "3 relevant sections" UI
    const attachedSet = new Set(context.attachedDocumentIds ?? []);
    const ragDocumentIds = context.documentIds?.filter((id) => !attachedSet.has(id));
    const ragContext = { ...context, documentIds: ragDocumentIds };

    if (enableNotebookSearch) {
      yield { type: "status", status: "planning", message: "Planning searches…" };

      const subqueryStart = Date.now();
      const plan = await this.llmWrapper.generateRetrievalSubqueries(userMessage, effectiveTurns);
      rerankQueryOpt = plan.rerankQuery;
      const { subqueries } = plan;
      logger.apiSuccess(
        "ChatLLMWrapper",
        "generateRetrievalSubqueries",
        Date.now() - subqueryStart,
        {
          subqueryCount: subqueries.length,
        }
      );

      yield { type: "status", status: "retrieving", message: "Searching your materials…" };

      const settled = await Promise.allSettled(
        subqueries.map((sq) => this.runSubqueryRetrieval(sq, ragContext, logger, isListQuery))
      );

      for (let i = 0; i < settled.length; i++) {
        const sq = subqueries[i];
        const r = settled[i];
        yield {
          type: "tool_call",
          data: { tool: "search_documents", query: sq, status: "searching" },
        };
        if (r.status === "fulfilled") {
          for (const chunk of r.value) {
            const key = chunkDedupKey(chunk);
            const idx = allChunks.findIndex((c) => chunkDedupKey(c) === key);
            if (idx < 0) {
              allChunks.push(chunk);
            } else {
              allChunks[idx] = mergeChunkScores(allChunks[idx], chunk);
            }
          }
          yield {
            type: "tool_call",
            data: {
              tool: "search_documents",
              query: sq,
              status: "done",
              resultCount: r.value.length,
            },
          };
        } else {
          logger.warn("Subquery search failed", { query: sq, error: String(r.reason) });
          yield {
            type: "tool_call",
            data: { tool: "search_documents", query: sq, status: "done", resultCount: 0 },
          };
        }
      }
    } else {
      logger.info("Notebook source search disabled — skipping hybrid retrieval");
    }

    // Build set of external chunk keys before merging so we can identify them after rerank
    const externalChunkKeys = new Set((context.externalChunks ?? []).map((c) => chunkDedupKey(c)));

    let merged = allChunks;
    if (context.externalChunks && context.externalChunks.length > 0) {
      merged = [...merged, ...context.externalChunks];
      logger.info("Merged external chunks before rerank", {
        notebookChunks: allChunks.length,
        externalChunks: context.externalChunks.length,
        totalBeforeRerank: merged.length,
      });
    }

    // User @-attached full documents must not be re-scored by query reranking — a long attached
    // doc often loses to a short snippet from another source, so citations point at the wrong file.
    const pinnedForRerank = merged.filter((c) => c.metadata?.userAttached === true);
    const poolForRerank = merged.filter((c) => !c.metadata?.userAttached);
    try {
      const rerankedPool =
        poolForRerank.length > 0
          ? await this.applyGlobalRerank(poolForRerank, rerankQueryOpt, userMessage, logger)
          : [];
      merged = [...pinnedForRerank, ...rerankedPool];
    } catch (e) {
      logger.warn("Global rerank failed, using merged hybrid scores", { error: String(e) });
      merged = [...pinnedForRerank, ...poolForRerank];
    }

    // GENERAL MULTI-SECTION DOCUMENT RETRIEVAL:
    // If many chunks come from a single document, replace them with the full document.
    // This applies whenever retrieval finds multiple relevant sections, regardless of query type.
    merged = await this.expandMultiSectionDocuments(merged, logger);

    // Split merged chunks back into notebook and external pools
    const notebookChunks = merged.filter((c) => !externalChunkKeys.has(chunkDedupKey(c)));
    const externalChunks = merged.filter((c) => externalChunkKeys.has(chunkDedupKey(c)));

    const userAttachedNotebook = notebookChunks.filter((c) => c.metadata?.userAttached === true);
    const restNotebook = notebookChunks.filter((c) => !c.metadata?.userAttached);
    const pinnedTokens = userAttachedNotebook.reduce((sum, c) => sum + countTokens(c.content), 0);
    const chunkCapTotal = isListQuery ? LIST_QUERY_MAX_SELECTED_CHUNKS : MAX_CHUNKS_HARD_LIMIT;
    const maxForRest = Math.max(0, chunkCapTotal - userAttachedNotebook.length);

    const rankedChunks = [
      ...userAttachedNotebook,
      ...selectChunksByTokenBudgetWithReservation(
        restNotebook,
        externalChunks,
        logger,
        undefined,
        isListQuery
          ? {
              maxSelectedChunks: maxForRest,
              maxContextTokens: Math.max(LIST_QUERY_CONTEXT_TOKEN_BUDGET - pinnedTokens, 800),
              lexicalQuery: userMessage,
            }
          : {
              maxSelectedChunks: maxForRest,
              maxContextTokens: Math.max(CONTEXT_TOKEN_BUDGET - pinnedTokens, 800),
            }
      ),
    ];

    if (rankedChunks.length === 0) {
      logger.info("No chunks found — streaming direct response");
      yield { type: "status", status: "thinking", message: "Generating response..." };
      const directAnswer = await this.llmWrapper.generateDirectResponse(
        userMessage,
        effectiveTurns,
        context.chatSettings
      );
      for (const para of directAnswer.split(/\n\n+/)) {
        if (para.trim().length > 0) {
          for await (const piece of sliceParagraphForStream(para)) {
            yield { type: "token", data: piece };
            await new Promise((resolve) => setTimeout(resolve, STREAM_TOKEN_DELAY_MS));
          }
        }
      }
      yield { type: "done" };
      return;
    }

    yield* this.streamRagAnswerFromChunks(
      context,
      userMessage,
      effectiveTurns,
      rankedChunks,
      logger
    );
  }

  private async *streamRagAnswerFromChunks(
    context: ChatAgentContext,
    userMessage: string,
    recentTurns: Array<{ role: string; content: string }>,
    allChunks: ReferenceChunk[],
    logger: ServiceLogger
  ): AsyncGenerator<StreamChunk> {
    const mode = this.resolveGroundingMode(context);

    const citationChunks: ReferenceChunk[] = allChunks.map((c, i) => ({
      ...c,
      id: String(i + 1),
    }));

    yield {
      type: "status",
      status: "reading",
      message: `Reading ${citationChunks.length} passages...`,
    };
    yield { type: "references", data: citationChunks };

    logger.info("Generating grounded response", {
      chunkCount: citationChunks.length,
      groundingMode: mode,
    });
    yield { type: "status", status: "thinking", message: "Formulating answer..." };

    const responseStart = Date.now();
    // Note: Removed timeout wrapper for streaming response generation.
    // The Together AI SDK handles streaming internally, and complex queries
    // (like "list 20 items") genuinely require more time. Let the request
    // complete naturally or fail with a real API error rather than timing out.
    let structuredResponse: ChatResponse = await this.llmWrapper.generateStructuredResponse(
      citationChunks,
      userMessage,
      recentTurns,
      context.chatSettings
    );
    logger.apiSuccess("ChatLLMWrapper", "generateStructuredResponse", Date.now() - responseStart, {
      responseLength: structuredResponse.answer_markdown.length,
      confidence: structuredResponse.confidence,
    });

    let isGrounded = true;
    let semanticOnlyFailure = false;
    let semanticValidation: {
      isGrounded: boolean;
      issues: string[];
      missingCitations: boolean;
    } = {
      isGrounded: true,
      issues: [],
      missingCitations: false,
    };

    if (mode === "sync") {
      logger.info("Validating grounding (sync)");
      const syntacticValidation = validateGrounding(
        structuredResponse.answer_markdown,
        citationChunks
      );
      semanticValidation = syntacticValidation.isGrounded
        ? await validateSemanticGrounding(
            structuredResponse.answer_markdown,
            citationChunks,
            this.embeddingService
          )
        : { isGrounded: false, issues: [], missingCitations: false };

      isGrounded = syntacticValidation.isGrounded && semanticValidation.isGrounded;

      if (!isGrounded) {
        if (syntacticValidation.isGrounded && !semanticValidation.isGrounded) {
          semanticOnlyFailure = true;
          logger.warn("Semantic grounding below threshold — keeping first response", {
            issues: semanticValidation.issues,
          });
        } else {
          logger.warn("Grounding failed — retrying with strict grounding");
          // Note: No timeout on retry - let the model take the time it needs
          structuredResponse = await this.llmWrapper.generateWithStrictGrounding(
            citationChunks,
            userMessage,
            recentTurns,
            context.chatSettings
          );

          const retrySyntactic = validateGrounding(
            structuredResponse.answer_markdown,
            citationChunks
          );
          const retrySemantic = retrySyntactic.isGrounded
            ? await validateSemanticGrounding(
                structuredResponse.answer_markdown,
                citationChunks,
                this.embeddingService
              )
            : { isGrounded: false, issues: [], missingCitations: false };
          isGrounded = retrySyntactic.isGrounded && retrySemantic.isGrounded;
          semanticValidation = retrySemantic;
          semanticOnlyFailure = retrySyntactic.isGrounded && !retrySemantic.isGrounded;
        }
      }
    }

    yield { type: "status", status: "generating", message: "Generating response..." };
    const finalText = structuredResponse.answer_markdown;

    if (mode === "async") {
      const groundingPromise = (async () => {
        const syn = validateGrounding(structuredResponse.answer_markdown, citationChunks);
        const sem = syn.isGrounded
          ? await validateSemanticGrounding(
              structuredResponse.answer_markdown,
              citationChunks,
              this.embeddingService
            )
          : { isGrounded: false, issues: [] as string[], missingCitations: false };
        const g = syn.isGrounded && sem.isGrounded;
        const semOnly = syn.isGrounded && !sem.isGrounded;
        return { sem, isGrounded: g, semanticOnlyFailure: semOnly };
      })();

      for (const para of finalText.split(/\n\n+/)) {
        if (para.trim().length > 0) {
          for await (const piece of sliceParagraphForStream(para)) {
            yield { type: "token", data: piece };
            await new Promise((resolve) => setTimeout(resolve, STREAM_TOKEN_DELAY_MS));
          }
        }
      }

      const g = await groundingPromise;
      isGrounded = g.isGrounded;
      semanticOnlyFailure = g.semanticOnlyFailure;

      if (!isGrounded) {
        const syntacticIssues = validateGrounding(
          structuredResponse.answer_markdown,
          citationChunks
        ).issues;
        const allIssues = semanticOnlyFailure
          ? [...g.sem.issues, ...syntacticIssues]
          : syntacticIssues;
        logger.warn("Async grounding check failed", {
          semanticOnlyFailure,
          issueCount: allIssues.length,
        });
        yield {
          type: "grounding_warn",
          data: {
            passed: false,
            issues: allIssues,
            message: semanticOnlyFailure
              ? "Note: Automated check suggests the answer may be only loosely aligned with cited passages"
              : "Note: This response may not be fully grounded in your documents",
          },
        };
      }
    } else {
      for (const para of finalText.split(/\n\n+/)) {
        if (para.trim().length > 0) {
          for await (const piece of sliceParagraphForStream(para)) {
            yield { type: "token", data: piece };
            await new Promise((resolve) => setTimeout(resolve, STREAM_TOKEN_DELAY_MS));
          }
        }
      }

      if (mode === "sync" && !isGrounded) {
        const syntacticIssues = validateGrounding(
          structuredResponse.answer_markdown,
          citationChunks
        ).issues;
        const allIssues = semanticOnlyFailure
          ? [...semanticValidation.issues, ...syntacticIssues]
          : syntacticIssues;
        yield {
          type: "grounding_check",
          data: {
            passed: false,
            issues: allIssues,
            message: semanticOnlyFailure
              ? "Note: Automated check suggests the answer may be only loosely aligned with cited passages"
              : "Note: This response may not be fully grounded in your documents",
          },
        };
      }
    }

    if (structuredResponse.confidence !== "high") {
      yield {
        type: "grounding_check",
        data: {
          passed: structuredResponse.confidence !== "low",
          issues:
            structuredResponse.confidence === "low" ? ["Low confidence in source coverage"] : [],
          message: `Response confidence: ${structuredResponse.confidence}`,
        },
      };
    }

    let followUps: string[] = [];
    try {
      followUps = await withTimeout(
        this.llmWrapper.generateFollowUpQuestions(userMessage, finalText),
        FOLLOWUP_GENERATION_TIMEOUT_MS,
        "follow_up_questions"
      );
    } catch (e) {
      logger.warn("Follow-up generation timed out or failed", { error: String(e) });
    }
    if (followUps.length > 0) {
      yield { type: "followups", data: followUps };
    }

    yield { type: "done" };
  }
}

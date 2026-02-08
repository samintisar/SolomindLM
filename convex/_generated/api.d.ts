/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audioOverviews from "../audioOverviews.js";
import type * as auth from "../auth.js";
import type * as cache from "../cache.js";
import type * as chat from "../chat.js";
import type * as chatStreamAction from "../chatStreamAction.js";
import type * as contentGeneration from "../contentGeneration.js";
import type * as conversations from "../conversations.js";
import type * as documents from "../documents.js";
import type * as embeddings from "../embeddings.js";
import type * as flashcards from "../flashcards.js";
import type * as folders from "../folders.js";
import type * as http from "../http.js";
import type * as jobs_AudioOverviewGenerationJob from "../jobs/AudioOverviewGenerationJob.js";
import type * as jobs_DocEmbeddingJob from "../jobs/DocEmbeddingJob.js";
import type * as jobs_FlashcardGenerationJob from "../jobs/FlashcardGenerationJob.js";
import type * as jobs_MindMapGenerationJob from "../jobs/MindMapGenerationJob.js";
import type * as jobs_QuizGenerationJob from "../jobs/QuizGenerationJob.js";
import type * as jobs_ReportGenerationJob from "../jobs/ReportGenerationJob.js";
import type * as jobs_SlideDeckGenerationJob from "../jobs/SlideDeckGenerationJob.js";
import type * as jobs_SpreadsheetGenerationJob from "../jobs/SpreadsheetGenerationJob.js";
import type * as jobs_WrittenQuestionsGenerationJob from "../jobs/WrittenQuestionsGenerationJob.js";
import type * as jobs_helpers from "../jobs/helpers.js";
import type * as lib_agents_AudioOverviewGraph from "../lib/agents/AudioOverviewGraph.js";
import type * as lib_agents_ChatAgent from "../lib/agents/ChatAgent.js";
import type * as lib_agents_FlashcardGraph from "../lib/agents/FlashcardGraph.js";
import type * as lib_agents_MindMapGraph from "../lib/agents/MindMapGraph.js";
import type * as lib_agents_QuizGraph from "../lib/agents/QuizGraph.js";
import type * as lib_agents_ReportGraph from "../lib/agents/ReportGraph.js";
import type * as lib_agents_SlideDeckGraph from "../lib/agents/SlideDeckGraph.js";
import type * as lib_agents_SpreadsheetGraph from "../lib/agents/SpreadsheetGraph.js";
import type * as lib_agents_WrittenQuestionsGraph from "../lib/agents/WrittenQuestionsGraph.js";
import type * as lib_agents_audio_overview_nodes from "../lib/agents/audio_overview/nodes.js";
import type * as lib_agents_audio_overview_prompts from "../lib/agents/audio_overview/prompts.js";
import type * as lib_agents_audio_overview_state from "../lib/agents/audio_overview/state.js";
import type * as lib_agents_chat_grounding_validator from "../lib/agents/chat/grounding_validator.js";
import type * as lib_agents_chat_hybrid_search from "../lib/agents/chat/hybrid_search.js";
import type * as lib_agents_chat_llm_wrapper from "../lib/agents/chat/llm_wrapper.js";
import type * as lib_agents_chat_vector_search from "../lib/agents/chat/vector_search.js";
import type * as lib_agents_flashcard_nodes from "../lib/agents/flashcard/nodes.js";
import type * as lib_agents_flashcard_prompts from "../lib/agents/flashcard/prompts.js";
import type * as lib_agents_flashcard_state from "../lib/agents/flashcard/state.js";
import type * as lib_agents_mindmap_nodes from "../lib/agents/mindmap/nodes.js";
import type * as lib_agents_mindmap_prompts from "../lib/agents/mindmap/prompts.js";
import type * as lib_agents_mindmap_state from "../lib/agents/mindmap/state.js";
import type * as lib_agents_quiz_nodes from "../lib/agents/quiz/nodes.js";
import type * as lib_agents_quiz_prompts from "../lib/agents/quiz/prompts.js";
import type * as lib_agents_quiz_state from "../lib/agents/quiz/state.js";
import type * as lib_agents_report_nodes from "../lib/agents/report/nodes.js";
import type * as lib_agents_report_prompts from "../lib/agents/report/prompts.js";
import type * as lib_agents_report_state from "../lib/agents/report/state.js";
import type * as lib_agents_shared_chunk_helper_factory from "../lib/agents/shared/chunk_helper_factory.js";
import type * as lib_agents_shared_chunk_operations from "../lib/agents/shared/chunk_operations.js";
import type * as lib_agents_shared_concurrency from "../lib/agents/shared/concurrency.js";
import type * as lib_agents_shared_graph_builder from "../lib/agents/shared/graph_builder.js";
import type * as lib_agents_shared_index from "../lib/agents/shared/index.js";
import type * as lib_agents_shared_langsmith from "../lib/agents/shared/langsmith.js";
import type * as lib_agents_shared_llm_factory from "../lib/agents/shared/llm_factory.js";
import type * as lib_agents_shared_logging from "../lib/agents/shared/logging.js";
import type * as lib_agents_shared_node_builder from "../lib/agents/shared/node_builder.js";
import type * as lib_agents_shared_progress from "../lib/agents/shared/progress.js";
import type * as lib_agents_shared_retry from "../lib/agents/shared/retry.js";
import type * as lib_agents_shared_sanitization from "../lib/agents/shared/sanitization.js";
import type * as lib_agents_shared_state_cleanup from "../lib/agents/shared/state_cleanup.js";
import type * as lib_agents_shared_state_factory from "../lib/agents/shared/state_factory.js";
import type * as lib_agents_shared_timeout from "../lib/agents/shared/timeout.js";
import type * as lib_agents_shared_tokenizer from "../lib/agents/shared/tokenizer.js";
import type * as lib_agents_shared_topic_extraction from "../lib/agents/shared/topic_extraction.js";
import type * as lib_agents_shared_validation from "../lib/agents/shared/validation.js";
import type * as lib_agents_slides_nodes from "../lib/agents/slides/nodes.js";
import type * as lib_agents_slides_prompts from "../lib/agents/slides/prompts.js";
import type * as lib_agents_slides_state from "../lib/agents/slides/state.js";
import type * as lib_agents_spreadsheet_nodes from "../lib/agents/spreadsheet/nodes.js";
import type * as lib_agents_spreadsheet_prompts from "../lib/agents/spreadsheet/prompts.js";
import type * as lib_agents_spreadsheet_state from "../lib/agents/spreadsheet/state.js";
import type * as lib_agents_written_questions_nodes from "../lib/agents/written_questions/nodes.js";
import type * as lib_agents_written_questions_prompts from "../lib/agents/written_questions/prompts.js";
import type * as lib_agents_written_questions_state from "../lib/agents/written_questions/state.js";
import type * as lib_cache from "../lib/cache.js";
import type * as lib_cacheMetrics from "../lib/cacheMetrics.js";
import type * as lib_cachedAgent from "../lib/cachedAgent.js";
import type * as lib_discovery_TavilySearchService from "../lib/discovery/TavilySearchService.js";
import type * as lib_embeddings from "../lib/embeddings.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_extraction_MistralOCRService from "../lib/extraction/MistralOCRService.js";
import type * as lib_extraction_SupadataLoaderService from "../lib/extraction/SupadataLoaderService.js";
import type * as lib_extractors from "../lib/extractors.js";
import type * as lib_grading_WrittenQuestionsGradingService from "../lib/grading/WrittenQuestionsGradingService.js";
import type * as lib_helpers_env from "../lib/helpers/env.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_llm from "../lib/llm.js";
import type * as lib_processing_EmbeddingServiceClient from "../lib/processing/EmbeddingServiceClient.js";
import type * as lib_processing_TextSplitterService from "../lib/processing/TextSplitterService.js";
import type * as lib_utils_urlValidation from "../lib/utils/urlValidation.js";
import type * as messages from "../messages.js";
import type * as mindmaps from "../mindmaps.js";
import type * as model_audioOverviews from "../model/audioOverviews.js";
import type * as model_conversations from "../model/conversations.js";
import type * as model_flashcards from "../model/flashcards.js";
import type * as model_folders from "../model/folders.js";
import type * as model_mindmaps from "../model/mindmaps.js";
import type * as model_notebooks from "../model/notebooks.js";
import type * as model_quizzes from "../model/quizzes.js";
import type * as model_reports from "../model/reports.js";
import type * as model_slides from "../model/slides.js";
import type * as model_spreadsheets from "../model/spreadsheets.js";
import type * as model_writtenQuestions from "../model/writtenQuestions.js";
import type * as notebooks from "../notebooks.js";
import type * as notes from "../notes.js";
import type * as quizzes from "../quizzes.js";
import type * as rateLimitService from "../rateLimitService.js";
import type * as rateLimits from "../rateLimits.js";
import type * as reports from "../reports.js";
import type * as server from "../server.js";
import type * as slides from "../slides.js";
import type * as spreadsheets from "../spreadsheets.js";
import type * as storage_ChatHistoryService from "../storage/ChatHistoryService.js";
import type * as storage_ConvexStorageService from "../storage/ConvexStorageService.js";
import type * as storage_VectorStoreService from "../storage/VectorStoreService.js";
import type * as stripeWebhook from "../stripeWebhook.js";
import type * as subscriptions from "../subscriptions.js";
import type * as subscriptionsActions from "../subscriptionsActions.js";
import type * as titleGenerator from "../titleGenerator.js";
import type * as writtenQuestionActions from "../writtenQuestionActions.js";
import type * as writtenQuestions from "../writtenQuestions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audioOverviews: typeof audioOverviews;
  auth: typeof auth;
  cache: typeof cache;
  chat: typeof chat;
  chatStreamAction: typeof chatStreamAction;
  contentGeneration: typeof contentGeneration;
  conversations: typeof conversations;
  documents: typeof documents;
  embeddings: typeof embeddings;
  flashcards: typeof flashcards;
  folders: typeof folders;
  http: typeof http;
  "jobs/AudioOverviewGenerationJob": typeof jobs_AudioOverviewGenerationJob;
  "jobs/DocEmbeddingJob": typeof jobs_DocEmbeddingJob;
  "jobs/FlashcardGenerationJob": typeof jobs_FlashcardGenerationJob;
  "jobs/MindMapGenerationJob": typeof jobs_MindMapGenerationJob;
  "jobs/QuizGenerationJob": typeof jobs_QuizGenerationJob;
  "jobs/ReportGenerationJob": typeof jobs_ReportGenerationJob;
  "jobs/SlideDeckGenerationJob": typeof jobs_SlideDeckGenerationJob;
  "jobs/SpreadsheetGenerationJob": typeof jobs_SpreadsheetGenerationJob;
  "jobs/WrittenQuestionsGenerationJob": typeof jobs_WrittenQuestionsGenerationJob;
  "jobs/helpers": typeof jobs_helpers;
  "lib/agents/AudioOverviewGraph": typeof lib_agents_AudioOverviewGraph;
  "lib/agents/ChatAgent": typeof lib_agents_ChatAgent;
  "lib/agents/FlashcardGraph": typeof lib_agents_FlashcardGraph;
  "lib/agents/MindMapGraph": typeof lib_agents_MindMapGraph;
  "lib/agents/QuizGraph": typeof lib_agents_QuizGraph;
  "lib/agents/ReportGraph": typeof lib_agents_ReportGraph;
  "lib/agents/SlideDeckGraph": typeof lib_agents_SlideDeckGraph;
  "lib/agents/SpreadsheetGraph": typeof lib_agents_SpreadsheetGraph;
  "lib/agents/WrittenQuestionsGraph": typeof lib_agents_WrittenQuestionsGraph;
  "lib/agents/audio_overview/nodes": typeof lib_agents_audio_overview_nodes;
  "lib/agents/audio_overview/prompts": typeof lib_agents_audio_overview_prompts;
  "lib/agents/audio_overview/state": typeof lib_agents_audio_overview_state;
  "lib/agents/chat/grounding_validator": typeof lib_agents_chat_grounding_validator;
  "lib/agents/chat/hybrid_search": typeof lib_agents_chat_hybrid_search;
  "lib/agents/chat/llm_wrapper": typeof lib_agents_chat_llm_wrapper;
  "lib/agents/chat/vector_search": typeof lib_agents_chat_vector_search;
  "lib/agents/flashcard/nodes": typeof lib_agents_flashcard_nodes;
  "lib/agents/flashcard/prompts": typeof lib_agents_flashcard_prompts;
  "lib/agents/flashcard/state": typeof lib_agents_flashcard_state;
  "lib/agents/mindmap/nodes": typeof lib_agents_mindmap_nodes;
  "lib/agents/mindmap/prompts": typeof lib_agents_mindmap_prompts;
  "lib/agents/mindmap/state": typeof lib_agents_mindmap_state;
  "lib/agents/quiz/nodes": typeof lib_agents_quiz_nodes;
  "lib/agents/quiz/prompts": typeof lib_agents_quiz_prompts;
  "lib/agents/quiz/state": typeof lib_agents_quiz_state;
  "lib/agents/report/nodes": typeof lib_agents_report_nodes;
  "lib/agents/report/prompts": typeof lib_agents_report_prompts;
  "lib/agents/report/state": typeof lib_agents_report_state;
  "lib/agents/shared/chunk_helper_factory": typeof lib_agents_shared_chunk_helper_factory;
  "lib/agents/shared/chunk_operations": typeof lib_agents_shared_chunk_operations;
  "lib/agents/shared/concurrency": typeof lib_agents_shared_concurrency;
  "lib/agents/shared/graph_builder": typeof lib_agents_shared_graph_builder;
  "lib/agents/shared/index": typeof lib_agents_shared_index;
  "lib/agents/shared/langsmith": typeof lib_agents_shared_langsmith;
  "lib/agents/shared/llm_factory": typeof lib_agents_shared_llm_factory;
  "lib/agents/shared/logging": typeof lib_agents_shared_logging;
  "lib/agents/shared/node_builder": typeof lib_agents_shared_node_builder;
  "lib/agents/shared/progress": typeof lib_agents_shared_progress;
  "lib/agents/shared/retry": typeof lib_agents_shared_retry;
  "lib/agents/shared/sanitization": typeof lib_agents_shared_sanitization;
  "lib/agents/shared/state_cleanup": typeof lib_agents_shared_state_cleanup;
  "lib/agents/shared/state_factory": typeof lib_agents_shared_state_factory;
  "lib/agents/shared/timeout": typeof lib_agents_shared_timeout;
  "lib/agents/shared/tokenizer": typeof lib_agents_shared_tokenizer;
  "lib/agents/shared/topic_extraction": typeof lib_agents_shared_topic_extraction;
  "lib/agents/shared/validation": typeof lib_agents_shared_validation;
  "lib/agents/slides/nodes": typeof lib_agents_slides_nodes;
  "lib/agents/slides/prompts": typeof lib_agents_slides_prompts;
  "lib/agents/slides/state": typeof lib_agents_slides_state;
  "lib/agents/spreadsheet/nodes": typeof lib_agents_spreadsheet_nodes;
  "lib/agents/spreadsheet/prompts": typeof lib_agents_spreadsheet_prompts;
  "lib/agents/spreadsheet/state": typeof lib_agents_spreadsheet_state;
  "lib/agents/written_questions/nodes": typeof lib_agents_written_questions_nodes;
  "lib/agents/written_questions/prompts": typeof lib_agents_written_questions_prompts;
  "lib/agents/written_questions/state": typeof lib_agents_written_questions_state;
  "lib/cache": typeof lib_cache;
  "lib/cacheMetrics": typeof lib_cacheMetrics;
  "lib/cachedAgent": typeof lib_cachedAgent;
  "lib/discovery/TavilySearchService": typeof lib_discovery_TavilySearchService;
  "lib/embeddings": typeof lib_embeddings;
  "lib/errors": typeof lib_errors;
  "lib/extraction/MistralOCRService": typeof lib_extraction_MistralOCRService;
  "lib/extraction/SupadataLoaderService": typeof lib_extraction_SupadataLoaderService;
  "lib/extractors": typeof lib_extractors;
  "lib/grading/WrittenQuestionsGradingService": typeof lib_grading_WrittenQuestionsGradingService;
  "lib/helpers/env": typeof lib_helpers_env;
  "lib/limits": typeof lib_limits;
  "lib/llm": typeof lib_llm;
  "lib/processing/EmbeddingServiceClient": typeof lib_processing_EmbeddingServiceClient;
  "lib/processing/TextSplitterService": typeof lib_processing_TextSplitterService;
  "lib/utils/urlValidation": typeof lib_utils_urlValidation;
  messages: typeof messages;
  mindmaps: typeof mindmaps;
  "model/audioOverviews": typeof model_audioOverviews;
  "model/conversations": typeof model_conversations;
  "model/flashcards": typeof model_flashcards;
  "model/folders": typeof model_folders;
  "model/mindmaps": typeof model_mindmaps;
  "model/notebooks": typeof model_notebooks;
  "model/quizzes": typeof model_quizzes;
  "model/reports": typeof model_reports;
  "model/slides": typeof model_slides;
  "model/spreadsheets": typeof model_spreadsheets;
  "model/writtenQuestions": typeof model_writtenQuestions;
  notebooks: typeof notebooks;
  notes: typeof notes;
  quizzes: typeof quizzes;
  rateLimitService: typeof rateLimitService;
  rateLimits: typeof rateLimits;
  reports: typeof reports;
  server: typeof server;
  slides: typeof slides;
  spreadsheets: typeof spreadsheets;
  "storage/ChatHistoryService": typeof storage_ChatHistoryService;
  "storage/ConvexStorageService": typeof storage_ConvexStorageService;
  "storage/VectorStoreService": typeof storage_VectorStoreService;
  stripeWebhook: typeof stripeWebhook;
  subscriptions: typeof subscriptions;
  subscriptionsActions: typeof subscriptionsActions;
  titleGenerator: typeof titleGenerator;
  writtenQuestionActions: typeof writtenQuestionActions;
  writtenQuestions: typeof writtenQuestions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  stripe: {
    private: {
      handleCheckoutSessionCompleted: FunctionReference<
        "mutation",
        "internal",
        {
          metadata?: any;
          mode: string;
          stripeCheckoutSessionId: string;
          stripeCustomerId?: string;
        },
        null
      >;
      handleCustomerCreated: FunctionReference<
        "mutation",
        "internal",
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
        },
        null
      >;
      handleCustomerUpdated: FunctionReference<
        "mutation",
        "internal",
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
        },
        null
      >;
      handleInvoiceCreated: FunctionReference<
        "mutation",
        "internal",
        {
          amountDue: number;
          amountPaid: number;
          created: number;
          status: string;
          stripeCustomerId: string;
          stripeInvoiceId: string;
          stripeSubscriptionId?: string;
        },
        null
      >;
      handleInvoicePaid: FunctionReference<
        "mutation",
        "internal",
        { amountPaid: number; stripeInvoiceId: string },
        null
      >;
      handleInvoicePaymentFailed: FunctionReference<
        "mutation",
        "internal",
        { stripeInvoiceId: string },
        null
      >;
      handlePaymentIntentSucceeded: FunctionReference<
        "mutation",
        "internal",
        {
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
        },
        null
      >;
      handleSubscriptionCreated: FunctionReference<
        "mutation",
        "internal",
        {
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
        },
        null
      >;
      handleSubscriptionDeleted: FunctionReference<
        "mutation",
        "internal",
        { stripeSubscriptionId: string },
        null
      >;
      handleSubscriptionUpdated: FunctionReference<
        "mutation",
        "internal",
        {
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          priceId?: string;
          quantity?: number;
          status: string;
          stripeSubscriptionId: string;
        },
        null
      >;
      updatePaymentCustomer: FunctionReference<
        "mutation",
        "internal",
        { stripeCustomerId: string; stripePaymentIntentId: string },
        null
      >;
      updateSubscriptionQuantityInternal: FunctionReference<
        "mutation",
        "internal",
        { quantity: number; stripeSubscriptionId: string },
        null
      >;
    };
    public: {
      createOrUpdateCustomer: FunctionReference<
        "mutation",
        "internal",
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
        },
        string
      >;
      getCustomer: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
        } | null
      >;
      getPayment: FunctionReference<
        "query",
        "internal",
        { stripePaymentIntentId: string },
        {
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          orgId?: string;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
          userId?: string;
        } | null
      >;
      getSubscription: FunctionReference<
        "query",
        "internal",
        { stripeSubscriptionId: string },
        {
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        } | null
      >;
      getSubscriptionByOrgId: FunctionReference<
        "query",
        "internal",
        { orgId: string },
        {
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        } | null
      >;
      listInvoices: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        Array<{
          amountDue: number;
          amountPaid: number;
          created: number;
          orgId?: string;
          status: string;
          stripeCustomerId: string;
          stripeInvoiceId: string;
          stripeSubscriptionId?: string;
          userId?: string;
        }>
      >;
      listInvoicesByOrgId: FunctionReference<
        "query",
        "internal",
        { orgId: string },
        Array<{
          amountDue: number;
          amountPaid: number;
          created: number;
          orgId?: string;
          status: string;
          stripeCustomerId: string;
          stripeInvoiceId: string;
          stripeSubscriptionId?: string;
          userId?: string;
        }>
      >;
      listInvoicesByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          amountDue: number;
          amountPaid: number;
          created: number;
          orgId?: string;
          status: string;
          stripeCustomerId: string;
          stripeInvoiceId: string;
          stripeSubscriptionId?: string;
          userId?: string;
        }>
      >;
      listPayments: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        Array<{
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          orgId?: string;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
          userId?: string;
        }>
      >;
      listPaymentsByOrgId: FunctionReference<
        "query",
        "internal",
        { orgId: string },
        Array<{
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          orgId?: string;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
          userId?: string;
        }>
      >;
      listPaymentsByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          orgId?: string;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
          userId?: string;
        }>
      >;
      listSubscriptions: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        Array<{
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        }>
      >;
      listSubscriptionsByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        }>
      >;
      updateSubscriptionMetadata: FunctionReference<
        "mutation",
        "internal",
        {
          metadata: any;
          orgId?: string;
          stripeSubscriptionId: string;
          userId?: string;
        },
        null
      >;
      updateSubscriptionQuantity: FunctionReference<
        "action",
        "internal",
        { apiKey: string; quantity: number; stripeSubscriptionId: string },
        null
      >;
    };
  };
  persistentTextStreaming: {
    lib: {
      addChunk: FunctionReference<
        "mutation",
        "internal",
        { final: boolean; streamId: string; text: string },
        any
      >;
      createStream: FunctionReference<"mutation", "internal", {}, any>;
      getStreamStatus: FunctionReference<
        "query",
        "internal",
        { streamId: string },
        "pending" | "streaming" | "done" | "error" | "timeout"
      >;
      getStreamText: FunctionReference<
        "query",
        "internal",
        { streamId: string },
        {
          status: "pending" | "streaming" | "done" | "error" | "timeout";
          text: string;
        }
      >;
      setStreamStatus: FunctionReference<
        "mutation",
        "internal",
        {
          status: "pending" | "streaming" | "done" | "error" | "timeout";
          streamId: string;
        },
        any
      >;
    };
  };
  actionCache: {
    crons: {
      purge: FunctionReference<
        "mutation",
        "internal",
        { expiresAt?: number },
        null
      >;
    };
    lib: {
      get: FunctionReference<
        "query",
        "internal",
        { args: any; name: string; ttl: number | null },
        { kind: "hit"; value: any } | { expiredEntry?: string; kind: "miss" }
      >;
      put: FunctionReference<
        "mutation",
        "internal",
        {
          args: any;
          expiredEntry?: string;
          name: string;
          ttl: number | null;
          value: any;
        },
        { cacheHit: boolean; deletedExpiredEntry: boolean }
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { args: any; name: string },
        null
      >;
      removeAll: FunctionReference<
        "mutation",
        "internal",
        { batchSize?: number; before?: number; name?: string },
        null
      >;
    };
  };
  rateLimiter: {
    lib: {
      checkRateLimit: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
      getValue: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          key?: string;
          name: string;
          sampleShards?: number;
        },
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          shard: number;
          ts: number;
          value: number;
        }
      >;
      rateLimit: FunctionReference<
        "mutation",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      resetRateLimit: FunctionReference<
        "mutation",
        "internal",
        { key?: string; name: string },
        null
      >;
    };
    time: {
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
    };
  };
};

/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _agents_AudioOverviewGraph from "../_agents/AudioOverviewGraph.js";
import type * as _agents_ChatAgent from "../_agents/ChatAgent.js";
import type * as _agents_FlashcardGraph from "../_agents/FlashcardGraph.js";
import type * as _agents_MindMapGraph from "../_agents/MindMapGraph.js";
import type * as _agents_QuizGraph from "../_agents/QuizGraph.js";
import type * as _agents_ReportGraph from "../_agents/ReportGraph.js";
import type * as _agents_SlideDeckGraph from "../_agents/SlideDeckGraph.js";
import type * as _agents_SpreadsheetGraph from "../_agents/SpreadsheetGraph.js";
import type * as _agents_WrittenQuestionsGraph from "../_agents/WrittenQuestionsGraph.js";
import type * as _agents__shared_cachedLlm from "../_agents/_shared/cachedLlm.js";
import type * as _agents__shared_chunk_helper_factory from "../_agents/_shared/chunk_helper_factory.js";
import type * as _agents__shared_chunk_operations from "../_agents/_shared/chunk_operations.js";
import type * as _agents__shared_concurrency from "../_agents/_shared/concurrency.js";
import type * as _agents__shared_graph_builder from "../_agents/_shared/graph_builder.js";
import type * as _agents__shared_index from "../_agents/_shared/index.js";
import type * as _agents__shared_jobHelpers from "../_agents/_shared/jobHelpers.js";
import type * as _agents__shared_langsmith from "../_agents/_shared/langsmith.js";
import type * as _agents__shared_llm_factory from "../_agents/_shared/llm_factory.js";
import type * as _agents__shared_logging from "../_agents/_shared/logging.js";
import type * as _agents__shared_node_builder from "../_agents/_shared/node_builder.js";
import type * as _agents__shared_progress from "../_agents/_shared/progress.js";
import type * as _agents__shared_retry from "../_agents/_shared/retry.js";
import type * as _agents__shared_sanitization from "../_agents/_shared/sanitization.js";
import type * as _agents__shared_state_cleanup from "../_agents/_shared/state_cleanup.js";
import type * as _agents__shared_state_factory from "../_agents/_shared/state_factory.js";
import type * as _agents__shared_timeout from "../_agents/_shared/timeout.js";
import type * as _agents__shared_tokenizer from "../_agents/_shared/tokenizer.js";
import type * as _agents__shared_topic_extraction from "../_agents/_shared/topic_extraction.js";
import type * as _agents__shared_validation from "../_agents/_shared/validation.js";
import type * as _agents_audio_overview_nodes from "../_agents/audio_overview/nodes.js";
import type * as _agents_audio_overview_prompts from "../_agents/audio_overview/prompts.js";
import type * as _agents_audio_overview_state from "../_agents/audio_overview/state.js";
import type * as _agents_chat_grounding_validator from "../_agents/chat/grounding_validator.js";
import type * as _agents_chat_hybrid_search from "../_agents/chat/hybrid_search.js";
import type * as _agents_chat_llm_wrapper from "../_agents/chat/llm_wrapper.js";
import type * as _agents_chat_rerankCache from "../_agents/chat/rerankCache.js";
import type * as _agents_chat_sourceSuggestions from "../_agents/chat/sourceSuggestions.js";
import type * as _agents_chat_vector_search from "../_agents/chat/vector_search.js";
import type * as _agents_flashcard_nodes from "../_agents/flashcard/nodes.js";
import type * as _agents_flashcard_prompts from "../_agents/flashcard/prompts.js";
import type * as _agents_flashcard_state from "../_agents/flashcard/state.js";
import type * as _agents_mindmap_nodes from "../_agents/mindmap/nodes.js";
import type * as _agents_mindmap_prompts from "../_agents/mindmap/prompts.js";
import type * as _agents_mindmap_state from "../_agents/mindmap/state.js";
import type * as _agents_quiz_nodes from "../_agents/quiz/nodes.js";
import type * as _agents_quiz_prompts from "../_agents/quiz/prompts.js";
import type * as _agents_quiz_state from "../_agents/quiz/state.js";
import type * as _agents_report_nodes from "../_agents/report/nodes.js";
import type * as _agents_report_prompts from "../_agents/report/prompts.js";
import type * as _agents_report_state from "../_agents/report/state.js";
import type * as _agents_slides_nodes from "../_agents/slides/nodes.js";
import type * as _agents_slides_prompts from "../_agents/slides/prompts.js";
import type * as _agents_slides_state from "../_agents/slides/state.js";
import type * as _agents_spreadsheet_nodes from "../_agents/spreadsheet/nodes.js";
import type * as _agents_spreadsheet_prompts from "../_agents/spreadsheet/prompts.js";
import type * as _agents_spreadsheet_state from "../_agents/spreadsheet/state.js";
import type * as _agents_written_questions_nodes from "../_agents/written_questions/nodes.js";
import type * as _agents_written_questions_prompts from "../_agents/written_questions/prompts.js";
import type * as _agents_written_questions_state from "../_agents/written_questions/state.js";
import type * as _lib_env from "../_lib/env.js";
import type * as _lib_errors from "../_lib/errors.js";
import type * as _lib_limits from "../_lib/limits.js";
import type * as _lib_rateLimits from "../_lib/rateLimits.js";
import type * as _lib_utils_urlValidation from "../_lib/utils/urlValidation.js";
import type * as _model_audioOverviews from "../_model/audioOverviews.js";
import type * as _model_conversations from "../_model/conversations.js";
import type * as _model_flashcards from "../_model/flashcards.js";
import type * as _model_folders from "../_model/folders.js";
import type * as _model_mindmaps from "../_model/mindmaps.js";
import type * as _model_notebooks from "../_model/notebooks.js";
import type * as _model_notes from "../_model/notes.js";
import type * as _model_quizzes from "../_model/quizzes.js";
import type * as _model_reports from "../_model/reports.js";
import type * as _model_slides from "../_model/slides.js";
import type * as _model_spreadsheets from "../_model/spreadsheets.js";
import type * as _model_writtenQuestions from "../_model/writtenQuestions.js";
import type * as _services_ai_embeddings from "../_services/ai/embeddings.js";
import type * as _services_ai_titleGenerator from "../_services/ai/titleGenerator.js";
import type * as _services_cache_cache from "../_services/cache/cache.js";
import type * as _services_cache_cacheCrypto from "../_services/cache/cacheCrypto.js";
import type * as _services_cache_cacheMetrics from "../_services/cache/cacheMetrics.js";
import type * as _services_cache_cachedAgent from "../_services/cache/cachedAgent.js";
import type * as _services_extraction_AudioTranscriptionService from "../_services/extraction/AudioTranscriptionService.js";
import type * as _services_extraction_MistralOCRService from "../_services/extraction/MistralOCRService.js";
import type * as _services_extraction_SupadataLoaderService from "../_services/extraction/SupadataLoaderService.js";
import type * as _services_extractors from "../_services/extractors.js";
import type * as _services_grading_WrittenQuestionsGradingService from "../_services/grading/WrittenQuestionsGradingService.js";
import type * as _services_processing_DocumentMetadataExtractor from "../_services/processing/DocumentMetadataExtractor.js";
import type * as _services_processing_EmbeddingServiceClient from "../_services/processing/EmbeddingServiceClient.js";
import type * as _services_processing_StructuralChunker from "../_services/processing/StructuralChunker.js";
import type * as _services_processing_TextSplitterService from "../_services/processing/TextSplitterService.js";
import type * as _services_search_TavilySearchService from "../_services/search/TavilySearchService.js";
import type * as auth from "../auth.js";
import type * as billing_actions from "../billing/actions.js";
import type * as billing_index from "../billing/index.js";
import type * as billing_webhook from "../billing/webhook.js";
import type * as chat_conversations from "../chat/conversations.js";
import type * as chat_index from "../chat/index.js";
import type * as chat_messages from "../chat/messages.js";
import type * as chat_sourceSuggestions from "../chat/sourceSuggestions.js";
import type * as chat_stream from "../chat/stream.js";
import type * as documents_embeddingJob from "../documents/embeddingJob.js";
import type * as documents_embeddings from "../documents/embeddings.js";
import type * as documents_index from "../documents/index.js";
import type * as folders_index from "../folders/index.js";
import type * as http from "../http.js";
import type * as notebooks_index from "../notebooks/index.js";
import type * as notes_index from "../notes/index.js";
import type * as notes_userNotes from "../notes/userNotes.js";
import type * as server from "../server.js";
import type * as storage_ChatHistoryService from "../storage/ChatHistoryService.js";
import type * as storage_ConvexStorageService from "../storage/ConvexStorageService.js";
import type * as storage_VectorStoreService from "../storage/VectorStoreService.js";
import type * as studio__helpers from "../studio/_helpers.js";
import type * as studio__shared from "../studio/_shared.js";
import type * as studio_audio_index from "../studio/audio/index.js";
import type * as studio_audio_job from "../studio/audio/job.js";
import type * as studio_flashcards_index from "../studio/flashcards/index.js";
import type * as studio_flashcards_job from "../studio/flashcards/job.js";
import type * as studio_mindmaps_index from "../studio/mindmaps/index.js";
import type * as studio_mindmaps_job from "../studio/mindmaps/job.js";
import type * as studio_quizzes_index from "../studio/quizzes/index.js";
import type * as studio_quizzes_job from "../studio/quizzes/job.js";
import type * as studio_reports_index from "../studio/reports/index.js";
import type * as studio_reports_job from "../studio/reports/job.js";
import type * as studio_slides_index from "../studio/slides/index.js";
import type * as studio_slides_job from "../studio/slides/job.js";
import type * as studio_spreadsheets_index from "../studio/spreadsheets/index.js";
import type * as studio_spreadsheets_job from "../studio/spreadsheets/job.js";
import type * as studio_writtenQuestions_grading from "../studio/writtenQuestions/grading.js";
import type * as studio_writtenQuestions_index from "../studio/writtenQuestions/index.js";
import type * as studio_writtenQuestions_job from "../studio/writtenQuestions/job.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_agents/AudioOverviewGraph": typeof _agents_AudioOverviewGraph;
  "_agents/ChatAgent": typeof _agents_ChatAgent;
  "_agents/FlashcardGraph": typeof _agents_FlashcardGraph;
  "_agents/MindMapGraph": typeof _agents_MindMapGraph;
  "_agents/QuizGraph": typeof _agents_QuizGraph;
  "_agents/ReportGraph": typeof _agents_ReportGraph;
  "_agents/SlideDeckGraph": typeof _agents_SlideDeckGraph;
  "_agents/SpreadsheetGraph": typeof _agents_SpreadsheetGraph;
  "_agents/WrittenQuestionsGraph": typeof _agents_WrittenQuestionsGraph;
  "_agents/_shared/cachedLlm": typeof _agents__shared_cachedLlm;
  "_agents/_shared/chunk_helper_factory": typeof _agents__shared_chunk_helper_factory;
  "_agents/_shared/chunk_operations": typeof _agents__shared_chunk_operations;
  "_agents/_shared/concurrency": typeof _agents__shared_concurrency;
  "_agents/_shared/graph_builder": typeof _agents__shared_graph_builder;
  "_agents/_shared/index": typeof _agents__shared_index;
  "_agents/_shared/jobHelpers": typeof _agents__shared_jobHelpers;
  "_agents/_shared/langsmith": typeof _agents__shared_langsmith;
  "_agents/_shared/llm_factory": typeof _agents__shared_llm_factory;
  "_agents/_shared/logging": typeof _agents__shared_logging;
  "_agents/_shared/node_builder": typeof _agents__shared_node_builder;
  "_agents/_shared/progress": typeof _agents__shared_progress;
  "_agents/_shared/retry": typeof _agents__shared_retry;
  "_agents/_shared/sanitization": typeof _agents__shared_sanitization;
  "_agents/_shared/state_cleanup": typeof _agents__shared_state_cleanup;
  "_agents/_shared/state_factory": typeof _agents__shared_state_factory;
  "_agents/_shared/timeout": typeof _agents__shared_timeout;
  "_agents/_shared/tokenizer": typeof _agents__shared_tokenizer;
  "_agents/_shared/topic_extraction": typeof _agents__shared_topic_extraction;
  "_agents/_shared/validation": typeof _agents__shared_validation;
  "_agents/audio_overview/nodes": typeof _agents_audio_overview_nodes;
  "_agents/audio_overview/prompts": typeof _agents_audio_overview_prompts;
  "_agents/audio_overview/state": typeof _agents_audio_overview_state;
  "_agents/chat/grounding_validator": typeof _agents_chat_grounding_validator;
  "_agents/chat/hybrid_search": typeof _agents_chat_hybrid_search;
  "_agents/chat/llm_wrapper": typeof _agents_chat_llm_wrapper;
  "_agents/chat/rerankCache": typeof _agents_chat_rerankCache;
  "_agents/chat/sourceSuggestions": typeof _agents_chat_sourceSuggestions;
  "_agents/chat/vector_search": typeof _agents_chat_vector_search;
  "_agents/flashcard/nodes": typeof _agents_flashcard_nodes;
  "_agents/flashcard/prompts": typeof _agents_flashcard_prompts;
  "_agents/flashcard/state": typeof _agents_flashcard_state;
  "_agents/mindmap/nodes": typeof _agents_mindmap_nodes;
  "_agents/mindmap/prompts": typeof _agents_mindmap_prompts;
  "_agents/mindmap/state": typeof _agents_mindmap_state;
  "_agents/quiz/nodes": typeof _agents_quiz_nodes;
  "_agents/quiz/prompts": typeof _agents_quiz_prompts;
  "_agents/quiz/state": typeof _agents_quiz_state;
  "_agents/report/nodes": typeof _agents_report_nodes;
  "_agents/report/prompts": typeof _agents_report_prompts;
  "_agents/report/state": typeof _agents_report_state;
  "_agents/slides/nodes": typeof _agents_slides_nodes;
  "_agents/slides/prompts": typeof _agents_slides_prompts;
  "_agents/slides/state": typeof _agents_slides_state;
  "_agents/spreadsheet/nodes": typeof _agents_spreadsheet_nodes;
  "_agents/spreadsheet/prompts": typeof _agents_spreadsheet_prompts;
  "_agents/spreadsheet/state": typeof _agents_spreadsheet_state;
  "_agents/written_questions/nodes": typeof _agents_written_questions_nodes;
  "_agents/written_questions/prompts": typeof _agents_written_questions_prompts;
  "_agents/written_questions/state": typeof _agents_written_questions_state;
  "_lib/env": typeof _lib_env;
  "_lib/errors": typeof _lib_errors;
  "_lib/limits": typeof _lib_limits;
  "_lib/rateLimits": typeof _lib_rateLimits;
  "_lib/utils/urlValidation": typeof _lib_utils_urlValidation;
  "_model/audioOverviews": typeof _model_audioOverviews;
  "_model/conversations": typeof _model_conversations;
  "_model/flashcards": typeof _model_flashcards;
  "_model/folders": typeof _model_folders;
  "_model/mindmaps": typeof _model_mindmaps;
  "_model/notebooks": typeof _model_notebooks;
  "_model/notes": typeof _model_notes;
  "_model/quizzes": typeof _model_quizzes;
  "_model/reports": typeof _model_reports;
  "_model/slides": typeof _model_slides;
  "_model/spreadsheets": typeof _model_spreadsheets;
  "_model/writtenQuestions": typeof _model_writtenQuestions;
  "_services/ai/embeddings": typeof _services_ai_embeddings;
  "_services/ai/titleGenerator": typeof _services_ai_titleGenerator;
  "_services/cache/cache": typeof _services_cache_cache;
  "_services/cache/cacheCrypto": typeof _services_cache_cacheCrypto;
  "_services/cache/cacheMetrics": typeof _services_cache_cacheMetrics;
  "_services/cache/cachedAgent": typeof _services_cache_cachedAgent;
  "_services/extraction/AudioTranscriptionService": typeof _services_extraction_AudioTranscriptionService;
  "_services/extraction/MistralOCRService": typeof _services_extraction_MistralOCRService;
  "_services/extraction/SupadataLoaderService": typeof _services_extraction_SupadataLoaderService;
  "_services/extractors": typeof _services_extractors;
  "_services/grading/WrittenQuestionsGradingService": typeof _services_grading_WrittenQuestionsGradingService;
  "_services/processing/DocumentMetadataExtractor": typeof _services_processing_DocumentMetadataExtractor;
  "_services/processing/EmbeddingServiceClient": typeof _services_processing_EmbeddingServiceClient;
  "_services/processing/StructuralChunker": typeof _services_processing_StructuralChunker;
  "_services/processing/TextSplitterService": typeof _services_processing_TextSplitterService;
  "_services/search/TavilySearchService": typeof _services_search_TavilySearchService;
  auth: typeof auth;
  "billing/actions": typeof billing_actions;
  "billing/index": typeof billing_index;
  "billing/webhook": typeof billing_webhook;
  "chat/conversations": typeof chat_conversations;
  "chat/index": typeof chat_index;
  "chat/messages": typeof chat_messages;
  "chat/sourceSuggestions": typeof chat_sourceSuggestions;
  "chat/stream": typeof chat_stream;
  "documents/embeddingJob": typeof documents_embeddingJob;
  "documents/embeddings": typeof documents_embeddings;
  "documents/index": typeof documents_index;
  "folders/index": typeof folders_index;
  http: typeof http;
  "notebooks/index": typeof notebooks_index;
  "notes/index": typeof notes_index;
  "notes/userNotes": typeof notes_userNotes;
  server: typeof server;
  "storage/ChatHistoryService": typeof storage_ChatHistoryService;
  "storage/ConvexStorageService": typeof storage_ConvexStorageService;
  "storage/VectorStoreService": typeof storage_VectorStoreService;
  "studio/_helpers": typeof studio__helpers;
  "studio/_shared": typeof studio__shared;
  "studio/audio/index": typeof studio_audio_index;
  "studio/audio/job": typeof studio_audio_job;
  "studio/flashcards/index": typeof studio_flashcards_index;
  "studio/flashcards/job": typeof studio_flashcards_job;
  "studio/mindmaps/index": typeof studio_mindmaps_index;
  "studio/mindmaps/job": typeof studio_mindmaps_job;
  "studio/quizzes/index": typeof studio_quizzes_index;
  "studio/quizzes/job": typeof studio_quizzes_job;
  "studio/reports/index": typeof studio_reports_index;
  "studio/reports/job": typeof studio_reports_job;
  "studio/slides/index": typeof studio_slides_index;
  "studio/slides/job": typeof studio_slides_job;
  "studio/spreadsheets/index": typeof studio_spreadsheets_index;
  "studio/spreadsheets/job": typeof studio_spreadsheets_job;
  "studio/writtenQuestions/grading": typeof studio_writtenQuestions_grading;
  "studio/writtenQuestions/index": typeof studio_writtenQuestions_index;
  "studio/writtenQuestions/job": typeof studio_writtenQuestions_job;
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

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
import type * as lib_cache from "../lib/cache.js";
import type * as lib_cacheMetrics from "../lib/cacheMetrics.js";
import type * as lib_cachedAgent from "../lib/cachedAgent.js";
import type * as lib_embeddings from "../lib/embeddings.js";
import type * as lib_extractors from "../lib/extractors.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_llm from "../lib/llm.js";
import type * as messages from "../messages.js";
import type * as mindmaps from "../mindmaps.js";
import type * as notebooks from "../notebooks.js";
import type * as notes from "../notes.js";
import type * as quizzes from "../quizzes.js";
import type * as rateLimitService from "../rateLimitService.js";
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
  "lib/cache": typeof lib_cache;
  "lib/cacheMetrics": typeof lib_cacheMetrics;
  "lib/cachedAgent": typeof lib_cachedAgent;
  "lib/embeddings": typeof lib_embeddings;
  "lib/extractors": typeof lib_extractors;
  "lib/limits": typeof lib_limits;
  "lib/llm": typeof lib_llm;
  messages: typeof messages;
  mindmaps: typeof mindmaps;
  notebooks: typeof notebooks;
  notes: typeof notes;
  quizzes: typeof quizzes;
  rateLimitService: typeof rateLimitService;
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
};

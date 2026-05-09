import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import {
  fulltextStatusValidator,
  ingestionStatusValidator,
  paperRecordValidator,
} from "./documents/paperRecord";

export default defineSchema({
  // Convex Auth tables (users, sessions, accounts, verificationTokens)
  ...authTables,

  // Notebooks table
  notebooks: defineTable({
    userId: v.id("users"),
    title: v.string(),
    coverColor: v.optional(v.string()),
    icon: v.optional(v.string()),
    isFeatured: v.optional(v.boolean()),
    folderId: v.optional(v.id("folders")),
    /** Overrides env CHAT_GROUNDING_MODE when set: async | sync | off */
    chatGroundingMode: v.optional(v.union(v.literal("async"), v.literal("sync"), v.literal("off"))),
    chatSettings: v.optional(
      v.object({
        instructionMode: v.union(
          v.literal("default"),
          v.literal("learningGuide"),
          v.literal("custom"),
        ),
        customInstructions: v.optional(v.string()),
        responseLength: v.union(
          v.literal("default"),
          v.literal("longer"),
          v.literal("shorter"),
        ),
        smartModel: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_createdAt", ["userId", "createdAt"])
    .index("by_folder", ["folderId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["userId", "folderId"],
    }),

  userOnboarding: defineTable({
    userId: v.id("users"),
    tourStatus: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("skipped"),
      v.literal("completed"),
    ),
    currentStepId: v.optional(
      v.union(
        v.literal("createNotebook"),
        v.literal("addSource"),
        v.literal("askQuestion"),
        v.literal("generateArtifact"),
      ),
    ),
    tourNotebookId: v.optional(v.id("notebooks")),
    checklistDismissed: v.boolean(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  userPreferences: defineTable({
    userId: v.id("users"),
    outputLanguage: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Share links: opaque token (stored as hash) for collaborate or fork-only access
  notebookShareLinks: defineTable({
    notebookId: v.id("notebooks"),
    kind: v.union(v.literal("collaborate"), v.literal("fork")),
    tokenHash: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_notebook", ["notebookId"]),

  // Members invited via collaborate link (editors on shared notebook)
  notebookMembers: defineTable({
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    role: v.literal("editor"),
    joinedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_notebook_and_user", ["notebookId", "userId"])
    .index("by_user", ["userId"]),

  // Folders table
  folders: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Documents table
  documents: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    fileName: v.string(),
    fileType: v.string(), // 'file' | 'url' | 'youtube' | 'text' | 'paper_record'
    fileSize: v.optional(v.number()),
    fileUrl: v.optional(v.string()),
    storageId: v.optional(v.string()), // Convex Storage ID
    googleDriveFileId: v.optional(v.string()),
    googleDriveMimeType: v.optional(v.string()),
    contentType: v.optional(v.string()), // e.g. application/pdf — used when fileName has no extension so UI can show PDF/DOCX etc.
    status: v.string(), // 'pending' | 'processing' | 'completed' | 'failed'
    error: v.optional(v.string()),
    metadata: v.optional(v.any()),
    // Document-level metadata (extracted during processing)
    wordCount: v.optional(v.number()),
    estimatedReadingTimeMinutes: v.optional(v.number()),
    totalPages: v.optional(v.number()),
    totalChunks: v.optional(v.number()),
    hasCodeBlocks: v.optional(v.boolean()),
    hasMathNotation: v.optional(v.boolean()),
    hasTables: v.optional(v.boolean()),
    hasImages: v.optional(v.boolean()),
    language: v.optional(v.string()),
    documentStructure: v.optional(v.union(v.literal("flat"), v.literal("hierarchical"))),
    maxHeadingLevel: v.optional(v.number()),
    /** Full extracted text for UI copy/view (not chunk-overlapped). RAG still uses documentChunks. */
    extractedMarkdown: v.optional(v.string()),
    /** Discovery-added research paper metadata + OA resolver fields */
    paperRecord: v.optional(paperRecordValidator),
    /** Whether an OA/full-text ingest path exists vs metadata-only vs external publisher */
    fulltextStatus: v.optional(fulltextStatusValidator),
    /** Ingest pipeline outcome for paper_record (orthogonal to `status` processing flag) */
    ingestionStatus: v.optional(ingestionStatusValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_notebook_and_status", ["notebookId", "status"])
    // Documents with storageId set (file uploads)
    .index("by_storage", ["storageId"]),

  // Vector search for RAG
  documentChunks: defineTable({
    documentId: v.id("documents"),
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    content: v.string(),
    chunkIndex: v.number(),
    embedding: v.optional(v.array(v.float64())),
    metadata: v.optional(v.any()),
    // Chunk-level metadata (extracted during chunking)
    totalChunks: v.optional(v.number()),
    relativePosition: v.optional(v.number()),
    chunkLengthChars: v.optional(v.number()),
    wordCount: v.optional(v.number()),
    sentenceCount: v.optional(v.number()),
    pageNumber: v.optional(v.number()),
    sectionTitle: v.optional(v.string()),
    sectionLevel: v.optional(v.number()),
    headingPath: v.optional(v.array(v.string())),
    previousChunkPreview: v.optional(v.string()),
    nextChunkPreview: v.optional(v.string()),
    hasCodeBlock: v.optional(v.boolean()),
    hasMathNotation: v.optional(v.boolean()),
    hasTable: v.optional(v.boolean()),
    hasBulletList: v.optional(v.boolean()),
    hasNumberedList: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_notebook", ["notebookId"])
    .vectorIndex("by_embedding", {
      dimensions: 1024, // NOTE: dimensions (plural), not dimension - updated for Together AI intfloat/multilingual-e5-large-instruct
      vectorField: "embedding",
      filterFields: ["userId", "notebookId"],
    })
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["userId", "notebookId"],
    }),

  // Reports table
  reports: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    content: v.optional(v.any()), // Report content (can be structured data)
    reportType: v.optional(v.string()), // Type of report: summary, analysis, etc.
    status: v.string(), // 'draft' | 'generating' | 'completed' | 'failed'
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_notebook_and_user", ["notebookId", "userId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Audio Overviews table
  audioOverviews: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    transcript: v.optional(v.string()),
    status: v.string(), // 'draft' | 'generating' | 'completed' | 'failed'
    audioType: v.optional(v.string()), // 'deep_dive' | 'brief' | 'critique' | 'debate'
    audioUrl: v.optional(v.string()), // Public URL to audio file in storage
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_notebook_and_user", ["notebookId", "userId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Flashcards table
  flashcards: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    status: v.string(), // 'draft' | 'generating' | 'completed' | 'failed'
    cardsData: v.optional(v.array(v.any())), // Array of flashcard objects
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_notebook_and_user", ["notebookId", "userId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Mindmaps table
  mindmaps: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    data: v.any(), // Mind map structure data
    status: v.string(), // 'draft' | 'generating' | 'completed' | 'failed'
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_notebook_and_user", ["notebookId", "userId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Quizzes table
  quizzes: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    status: v.string(), // 'draft' | 'generating' | 'completed' | 'failed'
    questionsData: v.optional(v.array(v.any())), // Array of question objects
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_notebook_and_user", ["notebookId", "userId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Infographics table
  infographics: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    data: v.any(), // Infographic data
    status: v.union(v.literal("draft"), v.literal("generating"), v.literal("completed"), v.literal("failed")),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_notebook_and_user", ["notebookId", "userId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Spreadsheets table
  spreadsheets: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    data: v.any(), // Spreadsheet structure data
    status: v.string(), // 'draft' | 'generating' | 'completed' | 'failed'
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_notebook_and_user", ["notebookId", "userId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Written Questions table
  writtenQuestions: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    status: v.string(), // 'draft' | 'generating' | 'completed' | 'failed'
    questionsData: v.array(v.any()), // Array of question objects
    questionType: v.string(), // 'short' | 'essay'
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_notebook_and_user", ["notebookId", "userId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Chat
  conversations: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.optional(v.string()),
    /** Active HTTP/chat stream jobs; >0 means assistant response is in progress (all clients can show “generating”). */
    chatGenerationInFlight: v.optional(v.number()),
    /** Last time a generation was started (UX / stale detection). */
    chatGenerationStartedAt: v.optional(v.number()),
    // Deprecated/unused fields (kept for schema compatibility)
    activeModes: v.optional(
      v.object({
        externalSearch: v.boolean(),
        guidedLearning: v.boolean(),
      })
    ),
    externalSearchSourceTypes: v.optional(
      v.object({
        academic: v.boolean(),
        finance: v.boolean(),
        news: v.boolean(),
        web: v.boolean(),
      })
    ),
    socraticThreadId: v.optional(v.string()),
    /** Instruction mode locked at conversation creation. */
    instructionMode: v.optional(
      v.union(v.literal("default"), v.literal("learningGuide"), v.literal("custom"))
    ),
    /** Custom instructions locked at conversation creation (only used when instructionMode is "custom"). */
    customInstructions: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_notebook", ["userId", "notebookId"])
    .index("by_notebook", ["notebookId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    references: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
    feedback: v.optional(v.union(v.literal("up"), v.literal("down"))),
    /** Idempotent assistant persistence for a single chat HTTP stream (sparse index). */
    streamId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_stream", ["conversationId", "streamId"]),

  // Notes table - for saved chat conversations and manual user notes
  notes: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    type: v.union(v.literal("chat"), v.literal("manual")), // 'chat' for saved conversations, 'manual' for user-created notes
    title: v.string(),
    status: v.string(), // 'completed' - for consistency with other note types
    content: v.optional(v.string()), // For manual notes (markdown content)
    messages: v.optional(v.array(v.any())), // For saved chats (conversation snapshot)
    messageCount: v.optional(v.number()), // For saved chats
    conversationId: v.optional(v.id("conversations")), // For saved chats - link to original conversation
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_notebook_and_user", ["notebookId", "userId"])
    .index("by_user", ["userId"])
    .index("by_type", ["type"]),

  // Stripe
  stripeSubscriptions: defineTable({
    userId: v.id("users"),
    stripeSubscriptionId: v.string(),
    stripeCustomerId: v.string(),
    stripePriceId: v.string(),
    status: v.string(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    interval: v.string(),
    amount: v.number(),
    currency: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("stripe_subscription", ["stripeSubscriptionId"]),

  stripeWebhookEvents: defineTable({
    stripeEventId: v.string(),
    eventType: v.string(),
    processed: v.boolean(),
    errorMessage: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("stripe_event", ["stripeEventId"]),

  stripePaymentHistory: defineTable({
    userId: v.id("users"),
    subscriptionId: v.id("stripeSubscriptions"),
    stripeInvoiceId: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
    status: v.string(),
    amount: v.number(),
    currency: v.string(),
    dueDate: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_subscription", ["subscriptionId"])
    .index("stripe_invoice", ["stripeInvoiceId"]),

  // Rate limiting
  rateLimits: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    count: v.number(),
    windowStart: v.number(),
    windowEnd: v.number(),
  })
    .index("by_user_endpoint", ["userId", "endpoint"])
    .index("by_user", ["userId"]),

  // Cache versioning for invalidation
  cacheVersions: defineTable({
    agentType: v.string(), // 'flashcard', 'quiz', etc.
    version: v.string(), // 'v1', 'v2', etc.
    updatedAt: v.number(),
  }).index("by_agent", ["agentType"]),

  // Cache metrics tracking
  cacheMetrics: defineTable({
    cacheType: v.string(), // 'agent', 'embedding'
    agentType: v.optional(v.string()), // 'flashcardV1', 'embeddingsV1', etc.
    hits: v.number(),
    misses: v.number(),
    lastHitAt: v.optional(v.number()),
    lastMissAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type", ["cacheType"])
    .index("by_agent", ["agentType"]),

  // Expo / native app push tokens (registered from mobile shell when authenticated)
  mobilePushTokens: defineTable({
    userId: v.id("users"),
    expoPushToken: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["expoPushToken"]),

  // Search analytics for discovery services
  searchAnalytics: defineTable({
    userId: v.id("users"),
    query: v.string(), // Normalized query
    sourceTypes: v.array(v.string()), // ['web', 'news', 'academic', 'finance']
    filters: v.optional(v.any()), // { timeRange, academicFilters, sortBy }
    resultsCount: v.number(), // Total results returned
    sourceTypeCounts: v.optional(v.any()), // { web: 5, academic: 10 }
    performanceMs: v.number(), // Total time in milliseconds
    cached: v.boolean(), // Was served from cache
    apiHealth: v.optional(v.any()), // { tavily: { status, timeMs }, academic: { status, timeMs } }
    error: v.optional(v.string()), // Error message if any
    timestamp: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_source_types", ["sourceTypes"]),

  // Deep Research - user-approved research plans
  researchPlans: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    query: v.string(),
    subQuestions: v.array(
      v.object({
        id: v.string(),
        question: v.string(),
        searchQueries: v.array(v.string()),
        sourceChannels: v.array(v.string()), // "notebook" | "web" | "academic" | "news"
        status: v.union(
          v.literal("pending"),
          v.literal("researching"),
          v.literal("completed")
        ),
      })
    ),
    sourcePolicy: v.object({
      channels: v.array(v.string()),
      domainAllowlist: v.optional(v.array(v.string())),
      dateRange: v.optional(v.object({ start: v.number(), end: v.number() })),
      maxResultsPerChannel: v.optional(v.number()),
      credibilityTier: v.optional(v.string()), // "primary" | "secondary" | "any"
      requirePrimarySources: v.optional(v.boolean()),
      recencyDays: v.optional(v.number()),
      dedupeStrategy: v.optional(v.string()), // "strict" | "semantic" | "off"
    }),
    status: v.string(), // "draft" | "approved" | "rejected"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Deep Research - execution state (separate from plans for re-runs)
  researchRuns: defineTable({
    planId: v.id("researchPlans"),
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    conversationId: v.id("conversations"),
    status: v.string(), // "pending" | "running" | "completed" | "failed" | "cancelled"
    currentIteration: v.number(),
    maxIterations: v.number(), // hard cap, default 2
    streamId: v.optional(v.string()),
    resultMessageId: v.optional(v.id("messages")),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    /** Latest run per plan: eq(planId) then order by createdAt */
    .index("by_planId_and_createdAt", ["planId", "createdAt"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Deep Research - typed, queryable evidence per run
  researchEvidence: defineTable({
    runId: v.id("researchRuns"),
    subQuestionId: v.string(),
    sourceType: v.string(), // "notebook" | "web" | "academic" | "news"
    sourceTitle: v.string(),
    sourceUrl: v.optional(v.string()),
    content: v.string(),
    relevanceScore: v.optional(v.number()),
    credibilityTier: v.optional(v.string()),
    iteration: v.number(), // which pass found this evidence
    metadata: v.optional(
      v.object({
        documentId: v.optional(v.id("documents")),
        chunkIndex: v.optional(v.number()),
        domain: v.optional(v.string()),
        publishedAt: v.optional(v.number()),
      })
    ),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_and_subquestion", ["runId", "subQuestionId"])
    .index("by_source_type", ["sourceType"]),

  // Note: Direct scheduling used instead of jobs table
  // Jobs are scheduled directly via ctx.scheduler.runAfter() from mutations

  // ── Prompt Library ──────────────────────────────────────────────────

  // Core prompt records (both private and public)
  studioPrompts: defineTable({
    userId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    promptText: v.string(),
    studioTool: v.union(
      v.literal("report"),
      v.literal("spreadsheet"),
      v.literal("infographic"),
      v.literal("flashcards"),
      v.literal("quiz"),
      v.literal("audio"),
      v.literal("writtenQuestions"),
      v.literal("mindmap"),
      // "slides" kept for migration — remove after running _migration/removeSlidePrompts
      v.literal("slides"),
    ),
    visibility: v.union(v.literal("private"), v.literal("public")),
    notebookId: v.optional(v.id("notebooks")),
    /** Points to the public original when this is a copied save. */
    sourcePromptId: v.optional(v.id("studioPrompts")),
    status: v.union(v.literal("active"), v.literal("hidden"), v.literal("removed")),
    // Cached leaderboard stats (only meaningful on public originals)
    saveCount: v.optional(v.number()),
    ratingCount: v.optional(v.number()),
    ratingSum: v.optional(v.number()),
    ratingAverage: v.optional(v.number()),
    bayesianRating: v.optional(v.number()),
    // Moderation
    reportCount: v.optional(v.number()),
    lastReportedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    // Ownership & scoping
    .index("by_user", ["userId"])
    .index("by_user_and_studioTool", ["userId", "studioTool"])
    .index("by_user_and_sourcePrompt", ["userId", "sourcePromptId"])
    .index("by_notebook", ["notebookId"])
    // Public listing sorted by saves
    .index("by_visibility_and_status_and_studioTool_and_saveCount", [
      "visibility",
      "status",
      "studioTool",
      "saveCount",
    ])
    // Public listing sorted by rating
    .index("by_visibility_and_status_and_studioTool_and_bayesianRating", [
      "visibility",
      "status",
      "studioTool",
      "bayesianRating",
    ])
    // Public listing sorted by newest
    .index("by_visibility_and_status_and_studioTool_and_createdAt", [
      "visibility",
      "status",
      "studioTool",
      "createdAt",
    ])
    // Search over title with filter fields
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["studioTool", "visibility", "status"],
    }),

  // One counted save per user per public prompt
  studioPromptSaves: defineTable({
    userId: v.id("users"),
    publicPromptId: v.id("studioPrompts"),
    savedAt: v.number(),
  })
    .index("by_user_and_public_prompt", ["userId", "publicPromptId"])
    .index("by_user", ["userId"])
    .index("by_public_prompt", ["publicPromptId"]),

  // One rating per user per public prompt (1-5)
  studioPromptRatings: defineTable({
    userId: v.id("users"),
    publicPromptId: v.id("studioPrompts"),
    rating: v.number(), // 1-5
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_and_public_prompt", ["userId", "publicPromptId"])
    .index("by_public_prompt", ["publicPromptId"]),

  // Moderation reports
  studioPromptReports: defineTable({
    promptId: v.id("studioPrompts"),
    reporterUserId: v.id("users"),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_prompt", ["promptId"])
    .index("by_prompt_and_reporter", ["promptId", "reporterUserId"]),

  // ── Literature Review & Citation tables ─────────────────────────────

  citations: defineTable({
    paperId: v.string(),
    title: v.string(),
    authors: v.array(v.string()),
    year: v.optional(v.number()),
    doi: v.optional(v.string()),
    url: v.string(),
    pdfUrl: v.optional(v.string()),
    sourceApi: v.union(v.literal("arxiv"), v.literal("semantic_scholar"), v.literal("pubmed")),
    citationCount: v.optional(v.number()),
    abstract: v.optional(v.string()),
    citationKey: v.string(),
  })
    .index("by_paperId", ["paperId"])
    .index("by_citationKey", ["citationKey"]),

  literatureTables: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    status: v.union(v.literal("generating"), v.literal("completed"), v.literal("failed")),
    columns: v.array(v.object({
      id: v.string(),
      name: v.string(),
      type: v.union(v.literal("paper_title"), v.literal("authors"), v.literal("year"), v.literal("study_type"), v.literal("custom")),
      instructions: v.optional(v.string()),
      isVisible: v.boolean(),
      isSystem: v.boolean(),
      order: v.number(),
    })),
    papers: v.array(v.object({
      citationId: v.id("citations"),
      rowData: v.record(v.string(), v.string()),
      includeReason: v.optional(v.string()),
      isIncluded: v.boolean(),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_user", ["userId"]),

  literatureReports: defineTable({
    title: v.string(),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    status: v.union(v.literal("generating"), v.literal("completed"), v.literal("failed")),
    content: v.string(),
    citationStyle: v.string(),
    sections: v.array(v.object({
      heading: v.string(),
      content: v.string(),
    })),
    citationIds: v.array(v.id("citations")),
    tableId: v.optional(v.id("literatureTables")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_table", ["tableId"]),

  researchSteps: defineTable({
    researchId: v.string(),
    agentType: v.union(v.literal("research"), v.literal("literature_review")),
    stepType: v.union(
      v.literal("planning"),
      v.literal("searching"), v.literal("deduplicating"), v.literal("ranking"),
      v.literal("screening"), v.literal("extracting"), v.literal("populating"),
      v.literal("generating_report"), v.literal("awaiting_user_input")
    ),
    status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed"), v.literal("failed")),
    details: v.optional(v.string()),
    metadata: v.optional(v.any()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    order: v.number(),
  })
    .index("by_research", ["researchId"])
    .index("by_research_step", ["researchId", "stepType"]),

  literatureReviewSessions: defineTable({
    query: v.string(),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    workflowId: v.string(),
    status: v.union(v.literal("planning"), v.literal("awaiting_columns"), v.literal("searching"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
    suggestedColumns: v.optional(v.array(v.object({
      id: v.string(), name: v.string(), instructions: v.optional(v.string()),
    }))),
    confirmedColumns: v.optional(v.array(v.object({
      id: v.string(), name: v.string(), instructions: v.optional(v.string()), isVisible: v.boolean(),
    }))),
    error: v.optional(v.string()),
    tableId: v.optional(v.id("literatureTables")),
    reportId: v.optional(v.id("literatureReports")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_user", ["userId"]),

  literatureTableDrafts: defineTable({
    sessionId: v.id("literatureReviewSessions"),
    citationId: v.id("citations"),
    rowData: v.record(v.string(), v.string()),
    includeReason: v.optional(v.string()),
    isIncluded: v.boolean(),
    batchNumber: v.number(),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_batch", ["sessionId", "batchNumber"]),
});

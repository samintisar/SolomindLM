import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

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
    chatGroundingMode: v.optional(
      v.union(v.literal("async"), v.literal("sync"), v.literal("off"))
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_folder", ["folderId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["userId", "folderId"],
    }),

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
  })
    .index("by_user", ["userId"]),

  // Documents table
  documents: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    fileName: v.string(),
    fileType: v.string(), // 'file' | 'url' | 'youtube' | 'text'
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

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
      dimensions: 1536, // NOTE: dimensions (plural), not dimension
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
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Slides table
  slides: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    data: v.any(), // Slide deck structure data
    status: v.string(), // 'draft' | 'generating' | 'completed' | 'failed'
    slideCount: v.optional(v.number()), // Number of slides
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_notebook", ["userId", "notebookId"]),

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
    .index("by_user", ["userId"])
    .index("by_type", ["type"]),

  // Wikis - Knowledge base compilation from notebook sources
  wikis: defineTable({
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(), // "Knowledge Base"
    status: v.string(), // 'draft' | 'generating' | 'completed' | 'failed'
    generatedAt: v.number(),
    lastRefreshedAt: v.optional(v.number()),
    metadata: v.optional(v.any()), // article counts, stats
    error: v.optional(v.string()), // Error message if failed
    /** Incremented on each refresh/cancel so in-flight jobs can detect stale runs */
    generationRunId: v.optional(v.number()),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Wiki articles - Individual concept/connection/qa articles
  wikiArticles: defineTable({
    wikiId: v.id("wikis"),
    path: v.string(), // "concepts/entities", "connections/relationships", "index", "log", etc.
    type: v.union(
      v.literal("concept"),
      v.literal("connection"),
      v.literal("qa"),
      v.literal("index"),
      v.literal("log")
    ),
    title: v.string(),
    content: v.string(), // Markdown content
    sources: v.array(v.id("documents")), // Which source documents this came from
    frontmatter: v.optional(v.any()), // YAML frontmatter data (slug, summary, related concepts, etc.)
    wordCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_wiki", ["wikiId"])
    .index("by_path", ["wikiId", "path"])
    .index("by_type", ["wikiId", "type"]),

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
    .index("stripe_subscription", ["stripeSubscriptionId"]),

  stripeWebhookEvents: defineTable({
    stripeEventId: v.string(),
    eventType: v.string(),
    processed: v.boolean(),
    errorMessage: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("stripe_event", ["stripeEventId"]),

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
    .index('by_user_endpoint', ['userId', 'endpoint'])
    .index('by_user', ['userId']),

  // Cache versioning for invalidation
  cacheVersions: defineTable({
    agentType: v.string(), // 'flashcard', 'quiz', etc.
    version: v.string(), // 'v1', 'v2', etc.
    updatedAt: v.number(),
  })
    .index("by_agent", ["agentType"]),

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
    apiHealth: v.optional(v.any()), // { tavily: { status, timeMs }, openalex: { status, timeMs } }
    error: v.optional(v.string()), // Error message if any
    timestamp: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_source_types", ["sourceTypes"]),

  // Note: Direct scheduling used instead of jobs table
  // Jobs are scheduled directly via ctx.scheduler.runAfter() from mutations
});

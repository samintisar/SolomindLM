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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_folder", ["folderId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["userId", "folderId"],
    }),

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
    status: v.string(), // 'pending' | 'processing' | 'completed' | 'failed'
    error: v.optional(v.string()),
    metadata: v.optional(v.any()),
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
    createdAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_notebook", ["notebookId"])
    .vectorIndex("by_embedding", {
      dimensions: 1536, // NOTE: dimensions (plural), not dimension
      vectorField: "embedding",
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
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"]),

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

  // Note: Direct scheduling used instead of jobs table
  // Jobs are scheduled directly via ctx.scheduler.runAfter() from mutations
});

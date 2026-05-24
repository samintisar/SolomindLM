import { v, ConvexError } from "convex/values";
import { query, mutation, internalMutation, internalQuery, internalAction } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { components } from "../_generated/api";
import { PersistentTextStreaming } from "@convex-dev/persistent-text-streaming";
import { getAuthUserId } from "../auth";
import { assertCanEditNotebook, assertCanReadNotebook } from "../_lib/notebookAccess";
export { createResearchArtifacts } from "./artifacts";

// ============================================================
// QUERIES
// ============================================================

export const getPlan = query({
  args: { planId: v.id("researchPlans") },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const plan = await ctx.db.get(args.planId);
    if (!plan) return null;
    try {
      await assertCanReadNotebook(ctx, plan.notebookId, userId);
    } catch {
      return null;
    }
    return plan;
  },
});

/** Latest run for a plan (for UI: in progress vs complete after approval). */
export const getLatestRunForPlan = query({
  args: { planId: v.id("researchPlans") },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const plan = await ctx.db.get(args.planId);
    if (!plan) return null;
    try {
      await assertCanReadNotebook(ctx, plan.notebookId, userId);
    } catch {
      return null;
    }
    const run = await ctx.db
      .query("researchRuns")
      .withIndex("by_planId_and_createdAt", (q) => q.eq("planId", args.planId))
      .order("desc")
      .first();
    return run ?? null;
  },
});

export const getRunStatus = query({
  args: { runId: v.id("researchRuns") },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    try {
      await assertCanReadNotebook(ctx, run.notebookId, userId);
    } catch {
      return null;
    }
    return run;
  },
});

export const getResearchSteps = query({
  args: {
    researchId: v.string(),
    notebookId: v.id("notebooks"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    try {
      await assertCanReadNotebook(ctx, args.notebookId, userId);
    } catch {
      return [];
    }
    return await ctx.db
      .query("researchSteps")
      .withIndex("by_research", (q) => q.eq("researchId", args.researchId))
      .order("asc")
      .take(100);
  },
});

export const getRunEvidence = query({
  args: { runId: v.id("researchRuns") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const run = await ctx.db.get(args.runId);
    if (!run) return [];
    try {
      await assertCanReadNotebook(ctx, run.notebookId, userId);
    } catch {
      return [];
    }
    return await ctx.db
      .query("researchEvidence")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
  },
});

// ============================================================
// INTERNAL QUERIES (for use by actions)
// ============================================================

export const getPlanInternal = internalQuery({
  args: { planId: v.id("researchPlans") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.planId);
  },
});

export const getRunInternal = internalQuery({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

/** Latest run for a plan (for HTTP idempotency). */
export const getLatestResearchRunByPlan = internalQuery({
  args: { planId: v.id("researchPlans") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("researchRuns")
      .withIndex("by_planId_and_createdAt", (q) => q.eq("planId", args.planId))
      .order("desc")
      .first();
  },
});

// ============================================================
// MUTATIONS
// ============================================================

export const createResearchPlan = internalMutation({
  args: {
    userId: v.string(),
    notebookId: v.id("notebooks"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    query: v.string(),
    sourcePolicy: v.object({
      channels: v.array(v.string()),
      domainAllowlist: v.optional(v.array(v.string())),
      dateRange: v.optional(v.object({ start: v.number(), end: v.number() })),
      maxResultsPerChannel: v.optional(v.number()),
      credibilityTier: v.optional(v.string()),
      requirePrimarySources: v.optional(v.boolean()),
      recencyDays: v.optional(v.number()),
      dedupeStrategy: v.optional(v.string()),
      academicFilters: v.optional(
        v.object({
          publicationYearFrom: v.optional(v.number()),
          publicationYearTo: v.optional(v.number()),
          minCitations: v.optional(v.number()),
          openAccessOnly: v.optional(v.boolean()),
          hasFullText: v.optional(v.boolean()),
          fieldOfStudyTerms: v.optional(v.array(v.string())),
        })
      ),
    }),
    subQuestions: v.array(
      v.object({
        id: v.string(),
        question: v.string(),
        searchQueries: v.array(v.string()),
        sourceChannels: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("researchPlans", {
      userId: args.userId as Id<"users">,
      notebookId: args.notebookId,
      conversationId: args.conversationId,
      messageId: args.messageId,
      query: args.query,
      subQuestions: args.subQuestions.map((sq) => ({
        ...sq,
        status: "pending" as const,
      })),
      sourcePolicy: args.sourcePolicy,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const approveResearchPlan = mutation({
  args: {
    planId: v.id("researchPlans"),
    modifiedSubQuestions: v.optional(
      v.array(
        v.object({
          id: v.string(),
          question: v.string(),
          searchQueries: v.array(v.string()),
          sourceChannels: v.array(v.string()),
        })
      )
    ),
  },
  returns: v.id("researchPlans"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in required" });
    }
    const plan = await ctx.db.get(args.planId);
    if (!plan) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Plan not found" });
    }
    await assertCanEditNotebook(ctx, plan.notebookId, userId);

    const subQuestions = args.modifiedSubQuestions
      ? args.modifiedSubQuestions.map((sq) => ({ ...sq, status: "pending" as const }))
      : plan.subQuestions;

    await ctx.db.patch(args.planId, {
      subQuestions,
      status: "approved",
      updatedAt: Date.now(),
    });

    return args.planId;
  },
});

export const rejectResearchPlan = mutation({
  args: { planId: v.id("researchPlans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in required" });
    }
    const plan = await ctx.db.get(args.planId);
    if (!plan) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Plan not found" });
    }
    await assertCanEditNotebook(ctx, plan.notebookId, userId);
    await ctx.db.patch(args.planId, {
      status: "rejected",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const createResearchRun = internalMutation({
  args: {
    planId: v.id("researchPlans"),
    userId: v.string(),
    notebookId: v.id("notebooks"),
    conversationId: v.id("conversations"),
    streamId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("researchRuns", {
      planId: args.planId,
      userId: args.userId as Id<"users">,
      notebookId: args.notebookId,
      conversationId: args.conversationId,
      status: "pending",
      currentIteration: 0,
      maxIterations: 2,
      streamId: args.streamId,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateRunProgress = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    status: v.optional(v.string()),
    currentIteration: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.status !== undefined) updates.status = args.status;
    if (args.currentIteration !== undefined) updates.currentIteration = args.currentIteration;
    if (args.error !== undefined) updates.error = args.error;
    if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = Date.now();
    }
    await ctx.db.patch(args.runId, updates);
  },
});

export const updateRunArtifacts = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    tableId: v.id("literatureTables"),
    reportId: v.id("literatureReports"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      tableId: args.tableId,
      reportId: args.reportId,
      updatedAt: Date.now(),
    });
  },
});

export const upsertResearchStep = internalMutation({
  args: {
    researchId: v.string(),
    agentType: v.union(v.literal("research"), v.literal("literature_review")),
    stepType: v.union(
      v.literal("planning"),
      v.literal("searching"),
      v.literal("deduplicating"),
      v.literal("ranking"),
      v.literal("screening"),
      v.literal("extracting"),
      v.literal("populating"),
      v.literal("generating_report"),
      v.literal("awaiting_user_input")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    details: v.optional(v.string()),
    metadata: v.optional(v.any()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("researchSteps")
      .withIndex("by_research", (q) => q.eq("researchId", args.researchId))
      .filter((q) => q.eq(q.field("stepType"), args.stepType))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        details: args.details,
        metadata: args.metadata,
        ...(args.status === "in_progress" && !existing.startedAt ? { startedAt: now } : {}),
        ...(args.status === "completed" || args.status === "failed" ? { completedAt: now } : {}),
      });
    } else {
      await ctx.db.insert("researchSteps", {
        researchId: args.researchId,
        agentType: args.agentType,
        stepType: args.stepType,
        status: args.status,
        details: args.details,
        metadata: args.metadata,
        order: args.order,
        startedAt: args.status === "in_progress" ? now : undefined,
        completedAt: args.status === "completed" || args.status === "failed" ? now : undefined,
      });
    }
  },
});

export const saveEvidence = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    evidence: v.array(
      v.object({
        subQuestionId: v.string(),
        sourceType: v.string(),
        sourceTitle: v.string(),
        sourceUrl: v.optional(v.string()),
        content: v.string(),
        relevanceScore: v.optional(v.number()),
        credibilityTier: v.optional(v.string()),
        iteration: v.number(),
        metadata: v.optional(
          v.object({
            documentId: v.optional(v.id("documents")),
            chunkIndex: v.optional(v.number()),
            domain: v.optional(v.string()),
            publishedAt: v.optional(v.number()),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const entry of args.evidence) {
      await ctx.db.insert("researchEvidence", {
        runId: args.runId,
        ...entry,
        createdAt: now,
      });
    }
  },
});

// ── Artifact generation exported from ./artifacts ───────────────────────

// ============================================================
// INTERNAL HELPERS
// ============================================================

export const createStreamInternal = internalAction({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const streaming = new PersistentTextStreaming(components.persistentTextStreaming);
    return await streaming.createStream(ctx);
  },
});

export const patchResearchPlanInternal = internalMutation({
  args: {
    planId: v.id("researchPlans"),
    patch: v.object({
      subQuestions: v.optional(
        v.array(
          v.object({
            id: v.string(),
            question: v.string(),
            searchQueries: v.array(v.string()),
            sourceChannels: v.array(v.string()),
            status: v.union(v.literal("pending"), v.literal("researching"), v.literal("completed")),
          })
        )
      ),
      status: v.optional(
        v.union(
          v.literal("planning"),
          v.literal("draft"),
          v.literal("approved"),
          v.literal("rejected"),
          v.literal("running"),
          v.literal("completed"),
          v.literal("failed")
        )
      ),
      query: v.optional(v.string()),
      sourcePolicy: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.planId, args.patch);
  },
});

import { PersistentTextStreaming } from "@convex-dev/persistent-text-streaming";
import { restart, sendEvent, type WorkflowId } from "@convex-dev/workflow";
import type { FunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { workflow } from "../_agents/research/DeepResearchGraph.js";
import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { assertCanEditNotebook, assertCanReadNotebook } from "../_lib/notebookAccess";
import { getAuthUserId } from "../auth";
import { normalizeResearchTitle } from "./titles";

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

export const getRunEvidenceInternal = internalQuery({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("researchEvidence")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
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

    // Resume the workflow if this plan has an associated workflow
    if (plan.workflowId) {
      await sendEvent(ctx, components.workflow, {
        name: "planApproved",
        workflowId: plan.workflowId as WorkflowId,
        value: {
          planId: args.planId,
          modifiedSubQuestions: args.modifiedSubQuestions,
        },
      });
    }

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
      researchTitle: v.optional(v.string()),
      sourcePolicy: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.planId, args.patch);
  },
});

export const setPlanResearchTitle = internalMutation({
  args: {
    planId: v.id("researchPlans"),
    researchTitle: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.planId, {
      researchTitle: normalizeResearchTitle(args.researchTitle),
      updatedAt: Date.now(),
    });
  },
});

export const startDeepResearch = mutation({
  args: {
    notebookId: v.id("notebooks"),
    conversationId: v.optional(v.id("conversations")),
    query: v.string(),
    sourcePolicy: v.optional(
      v.object({
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
      })
    ),
    smartModel: v.optional(v.string()),
  },
  returns: v.object({
    planId: v.id("researchPlans"),
    conversationId: v.id("conversations"),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in required" });
    }

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    // Ensure conversation exists
    const conversationId: Id<"conversations"> = await ctx.runMutation(
      internal.chat.index.ensureConversation,
      {
        notebookId: args.notebookId,
        userId,
        conversationId: args.conversationId,
      }
    );

    // Insert user message
    const userMessageId: Id<"messages"> = await ctx.runMutation(internal.chat.index.addMessage, {
      conversationId,
      role: "user",
      content: args.query,
    });

    // Insert assistant placeholder
    const assistantMessageId: Id<"messages"> = await ctx.runMutation(
      internal.chat.index.addMessage,
      {
        conversationId,
        role: "assistant",
        content: `Planning deep research...`,
        metadata: { isDeepResearch: true, status: "planning" as const },
      }
    );

    // Create placeholder plan row
    const planId: Id<"researchPlans"> = await ctx.db.insert("researchPlans", {
      userId,
      notebookId: args.notebookId,
      conversationId,
      messageId: userMessageId,
      query: args.query,
      subQuestions: [],
      sourcePolicy: args.sourcePolicy ?? { channels: ["notebook", "web"] },
      status: "planning" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Start workflow
    const workflowId: string = await workflow.start(
      ctx,
      internal._agents.research.DeepResearchGraph.deepResearchWorkflow,
      {
        query: args.query,
        notebookId: args.notebookId,
        userId,
        conversationId,
        assistantMessageId,
        planId,
        sourcePolicy: args.sourcePolicy ?? { channels: ["notebook", "web"] },
        smartModel: args.smartModel,
      }
    );

    // Patch plan with workflowId
    await ctx.db.patch(planId, { workflowId, updatedAt: Date.now() });

    return { planId, conversationId };
  },
});

export const retryDeepResearch = mutation({
  args: {
    planId: v.id("researchPlans"),
    fromStep: v.optional(v.union(v.literal("planning"), v.literal("execution"))),
  },
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
    if (plan.userId !== userId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not authorized" });
    }
    await assertCanEditNotebook(ctx, plan.notebookId, userId);

    if (!plan.workflowId) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "This plan does not support workflow retry",
      });
    }

    const stepMap: Record<string, FunctionReference<"action", "internal">> = {
      planning: internal.research.workflowSteps.planReview,
      execution: internal.research.workflowSteps.executeResearch,
    };

    const fromStep = args.fromStep ?? "execution";
    const fromAction = stepMap[fromStep];
    if (!fromAction) {
      throw new ConvexError({ code: "BAD_REQUEST", message: `Invalid step: ${fromStep}` });
    }

    await ctx.db.patch(args.planId, {
      status: fromStep === "planning" ? "planning" : "running",
      updatedAt: Date.now(),
    });

    await restart(ctx, components.workflow, plan.workflowId as WorkflowId, {
      from: fromAction,
    });

    return null;
  },
});

/**
 * INTERNAL: Cancel any active research workflows and runs tied to a conversation.
 * Called when a conversation is deleted or cleared so orphaned workflows
 * do not persist results into a non-existent (or recycled) chat.
 */
export const cancelResearchForConversationInternal = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("researchPlans")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    for (const plan of plans) {
      if (plan.workflowId && ["planning", "draft", "approved", "running"].includes(plan.status)) {
        try {
          await workflow.cancel(ctx, plan.workflowId as WorkflowId);
        } catch {
          // Workflow may already be completed or cancelled.
        }
        await ctx.db.patch(plan._id, { status: "failed", updatedAt: Date.now() });
      }

      const runs = await ctx.db
        .query("researchRuns")
        .withIndex("by_plan", (q) => q.eq("planId", plan._id))
        .collect();

      for (const run of runs) {
        if (["pending", "running"].includes(run.status)) {
          await ctx.db.patch(run._id, { status: "cancelled", updatedAt: Date.now() });
        }
      }
    }
  },
});

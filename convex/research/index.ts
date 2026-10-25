import { PersistentTextStreaming } from "@convex-dev/persistent-text-streaming";
import { restart, sendEvent, type WorkflowId } from "@convex-dev/workflow";
import type { FunctionReference } from "convex/server";
import { ConvexError, type Infer, v } from "convex/values";
import { workflow } from "../_agents/research/DeepResearchGraph.js";
import { components, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalAction,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
  query,
} from "../_generated/server";
import { getConversationIfReadable } from "../_lib/conversationAccess";
import {
  assertConcurrentRunCapacity,
  assertRetryAllowed,
  isProUser,
  takeFeatureRun,
} from "../_lib/limits";
import { assertCanEditNotebook, getNotebookAccess } from "../_lib/notebookAccess";
import { getAuthUserId } from "../auth";
import { internalMutation, mutation } from "../functions";
import { scheduleResearchRunCompletionPush } from "../push/notify";
import { normalizeResearchTitle } from "./titles";

export { createResearchArtifacts } from "./artifacts";

// ============================================================
// QUERIES
// ============================================================

/**
 * A plan or run is readable when the user can see the conversation it belongs to, so a viewer of
 * a public notebook never reads research from someone else's thread.
 */
async function canReadResearch(
  ctx: QueryCtx,
  row: { notebookId: Id<"notebooks">; conversationId: Id<"conversations"> },
  userId: Id<"users">
): Promise<boolean> {
  const conversation = await getConversationIfReadable(ctx, row.conversationId, userId);
  return conversation !== null && conversation.notebookId === row.notebookId;
}

/**
 * Steps are keyed by a run, plan or literature review session id. Each must belong to
 * `notebookId` and be visible to the user. Review sessions have no conversation; like the session
 * itself (`canReadReviewSession` in `studio/literature_tables`), only their creator reads them,
 * and only while they own or edit the notebook.
 */
async function canReadResearchSteps(
  ctx: QueryCtx,
  researchId: string,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<boolean> {
  const runId = ctx.db.normalizeId("researchRuns", researchId);
  const planId = ctx.db.normalizeId("researchPlans", researchId);
  const row = runId ? await ctx.db.get(runId) : planId ? await ctx.db.get(planId) : null;
  if (row) return row.notebookId === notebookId && (await canReadResearch(ctx, row, userId));

  const sessionId = ctx.db.normalizeId("literatureReviewSessions", researchId);
  const session = sessionId ? await ctx.db.get(sessionId) : null;
  if (!session || session.notebookId !== notebookId || session.userId !== userId) return false;
  const access = await getNotebookAccess(ctx, notebookId, userId);
  return access === "owner" || access === "editor";
}

export const getPlan = query({
  args: { planId: v.id("researchPlans") },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const plan = await ctx.db.get(args.planId);
    if (!plan) return null;
    if (!(await canReadResearch(ctx, plan, userId))) return null;
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
    if (!(await canReadResearch(ctx, plan, userId))) return null;
    const run = await ctx.db
      .query("researchRuns")
      .withIndex("by_planId_and_createdAt", (q) => q.eq("planId", args.planId))
      .order("desc")
      .first();
    return run ?? null;
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
    if (!(await canReadResearchSteps(ctx, args.researchId, args.notebookId, userId))) return [];
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
    if (!(await canReadResearch(ctx, run, userId))) return [];
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

type SubQuestionEdit = {
  id: string;
  question: string;
  searchQueries: string[];
  sourceChannels: string[];
};

/** Approves the plan (with the user's edits, if any) and resumes its workflow. Callers check access. */
export async function approveResearchPlanAndResume(
  ctx: MutationCtx,
  plan: Doc<"researchPlans">,
  modifiedSubQuestions?: SubQuestionEdit[]
): Promise<void> {
  const subQuestions = modifiedSubQuestions
    ? modifiedSubQuestions.map((sq) => ({ ...sq, status: "pending" as const }))
    : plan.subQuestions;
  await ctx.db.patch(plan._id, { subQuestions, status: "approved", updatedAt: Date.now() });
  // Resume the workflow if this plan has an associated workflow
  if (plan.workflowId) {
    await sendEvent(ctx, components.workflow, {
      name: "planApproved",
      workflowId: plan.workflowId as WorkflowId,
      value: { planId: plan._id, modifiedSubQuestions },
    });
  }
}

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

    await approveResearchPlanAndResume(ctx, plan, args.modifiedSubQuestions);
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

    if (args.status === "completed") {
      const run = await ctx.db.get(args.runId);
      if (run) {
        await scheduleResearchRunCompletionPush(ctx, {
          userId: run.userId,
          notebookId: run.notebookId,
          runId: run._id,
        });
      }
    }
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
            doi: v.optional(v.string()),
            citationCount: v.optional(v.number()),
            authors: v.optional(v.array(v.string())),
            year: v.optional(v.number()),
            sourceApi: v.optional(
              v.union(
                v.literal("openalex"),
                v.literal("arxiv"),
                v.literal("semantic_scholar"),
                v.literal("pubmed")
              )
            ),
            pdfUrl: v.optional(v.string()),
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

/** Where deep research looks; the same shape the workflow takes. */
const sourcePolicyValidator = v.object({
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
});

type SourcePolicy = Infer<typeof sourcePolicyValidator>;

/**
 * Creates the chat messages and plan row and starts the deep-research workflow. Callers check
 * edit access and run limits first (`startDeepResearch`; the showcase seed is internal).
 */
export async function startDeepResearchRun(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    notebookId: Id<"notebooks">;
    conversationId?: Id<"conversations">;
    query: string;
    sourcePolicy?: SourcePolicy;
    smartModel?: string;
  }
): Promise<{ planId: Id<"researchPlans">; conversationId: Id<"conversations"> }> {
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
  const assistantMessageId: Id<"messages"> = await ctx.runMutation(internal.chat.index.addMessage, {
    conversationId,
    role: "assistant",
    content: `Planning deep research...`,
    metadata: { isDeepResearch: true, status: "planning" as const },
  });

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
}

export const startDeepResearch = mutation({
  args: {
    notebookId: v.id("notebooks"),
    conversationId: v.optional(v.id("conversations")),
    query: v.string(),
    sourcePolicy: v.optional(sourcePolicyValidator),
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

    // Pro only. Count the run at start (planning included) so parallel starts
    // can't all pass the check; mutations are atomic, so a later throw undoes it.
    const { isPro } = await takeFeatureRun(ctx, userId, "deepResearch");
    await assertConcurrentRunCapacity(ctx, userId, "deepResearch", isPro);

    return await startDeepResearchRun(ctx, userId, args);
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

    // Retries reuse the run they belong to, so cap them instead of charging again.
    // A user who has since dropped to Free can still retry a run they paid for.
    const isPro = await isProUser(ctx, userId);
    assertRetryAllowed(plan.retryCount, "deepResearch", isPro);
    await assertConcurrentRunCapacity(ctx, userId, "deepResearch", isPro);

    await ctx.db.patch(args.planId, {
      status: fromStep === "planning" ? "planning" : "running",
      retryCount: (plan.retryCount ?? 0) + 1,
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

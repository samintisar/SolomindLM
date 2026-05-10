import { mutation, internalQuery, internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "../../auth";
import { assertCanEditNotebook } from "../../_lib/notebookAccess";

function generateWorkflowId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Internal query: fetch a literature review session by ID.
 */
export const getSessionInternal = internalQuery({
  args: {
    sessionId: v.id("literatureReviewSessions"),
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.sessionId);
  },
});

/**
 * Internal mutation: create or get a citation by paperId.
 * Checks if a citation exists by paperId, if not creates one.
 */
export const createCitation = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("citations")
      .withIndex("by_paperId", (q) => q.eq("paperId", args.paperId))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("citations", args);
  },
});

/**
 * Internal mutation: create a literature table.
 * Used by the literature review agent to persist the generated table.
 */
export const createLiteratureTable = internalMutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
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
  },
  handler: async (ctx, args) => {
    await assertCanEditNotebook(ctx, args.notebookId, args.userId);

    return await ctx.db.insert("literatureTables", {
      ...args,
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Start a new literature review workflow.
 *
 * Creates a literatureReviewSessions record and schedules the planReview action
 * to begin the workflow.
 */
export const startLiteratureReview = mutation({
  args: {
    query: v.string(),
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    const sessionId = await ctx.db.insert("literatureReviewSessions", {
      query: args.query,
      notebookId: args.notebookId,
      userId,
      workflowId: generateWorkflowId(),
      status: "planning",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal._agents.literature_review.actions.planReview, {
      query: args.query,
    });

    return sessionId;
  },
});

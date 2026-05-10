import { mutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "../../auth";
import { assertCanEditNotebook } from "../../_lib/notebookAccess";

function generateWorkflowId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

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

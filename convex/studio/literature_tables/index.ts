import { v } from "convex/values";
import { mutation } from "../../_generated/server";
import { sendEvent, type WorkflowId } from "@convex-dev/workflow";
import { components, internal } from "../../_generated/api";
import { getAuthUserId } from "../../auth";
import { assertCanEditNotebook } from "../../_lib/notebookAccess";
import { workflow } from "../../_agents/literature_review/LiteratureReviewGraph.js";

/**
 * Confirm literature review columns and resume the workflow.
 *
 * Called by the frontend after the user accepts/edits the suggested columns.
 * Updates the session status and sends an event to resume the workflow.
 */
export const confirmLiteratureReviewColumns = mutation({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    confirmedColumns: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        instructions: v.optional(v.string()),
        isVisible: v.boolean(),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error(`Literature review session not found: ${args.sessionId}`);
    }

    if (session.userId !== userId) {
      throw new Error("Not authorized to update this literature review session");
    }

    await assertCanEditNotebook(ctx, session.notebookId, userId);

    if (!session.workflowId) {
      throw new Error(
        `Session ${args.sessionId} does not have an associated workflowId`
      );
    }

    await ctx.db.patch(args.sessionId, {
      confirmedColumns: args.confirmedColumns,
      status: "searching",
      updatedAt: Date.now(),
    });

    await sendEvent(ctx, components.workflow, {
      name: "columnsConfirmed",
      workflowId: session.workflowId as WorkflowId,
      value: { confirmedColumns: args.confirmedColumns },
    });

    return null;
  },
});

/**
 * Start a new literature review workflow.
 *
 * Creates a session record and kicks off the workflow.
 * TODO: Implement once workflow and session creation patterns are finalized.
 */
export const startLiteratureReview = mutation({
  args: {
    query: v.string(),
    notebookId: v.id("notebooks"),
  },
  returns: v.object({
    sessionId: v.id("literatureReviewSessions"),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    // Create session record
    const sessionId = await ctx.db.insert("literatureReviewSessions", {
      query: args.query,
      notebookId: args.notebookId,
      userId,
      workflowId: "", // Will be updated after workflow starts
      status: "planning",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Start workflow
    const workflowId = await workflow.start(
      ctx,
      internal._agents.literature_review.LiteratureReviewGraph.literatureReviewWorkflow,
      {
        query: args.query,
        notebookId: args.notebookId,
        userId,
        sessionId,
      }
    );

    // Update session with workflowId
    await ctx.db.patch(sessionId, {
      workflowId,
      updatedAt: Date.now(),
    });

    return { sessionId };
  },
});

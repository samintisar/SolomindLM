import { v } from "convex/values";
import { mutation } from "../../_generated/server";
import { sendEvent, type WorkflowId } from "@convex-dev/workflow";
import { components } from "../../_generated/api";
import { getAuthUserId } from "../../auth";
import { assertCanEditNotebook } from "../../_lib/notebookAccess";

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
  handler: async (_ctx, _args) => {
    // TODO: Implement session creation and workflow.start()
    // Example:
    // const sessionId = await ctx.db.insert("literatureReviewSessions", {
    //   query: args.query,
    //   notebookId: args.notebookId,
    //   userId: ctx.userId, // or from auth
    //   workflowId: "", // populated after workflow.start()
    //   status: "planning",
    //   createdAt: Date.now(),
    //   updatedAt: Date.now(),
    // });
    //
    // const workflowId = await workflow.start(ctx, internal._agents.literature_review.LiteratureReviewGraph.literatureReviewWorkflow, {
    //   query: args.query,
    //   notebookId: args.notebookId,
    //   userId: ctx.userId,
    //   sessionId,
    // });
    //
    // await ctx.db.patch(sessionId, { workflowId });
    // return { sessionId, workflowId };
    throw new Error("Not yet implemented");
  },
});

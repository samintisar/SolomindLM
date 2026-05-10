import { v } from "convex/values";
import { mutation } from "../../_generated/server";
import { sendEvent, type WorkflowId } from "@convex-dev/workflow";
import { components } from "../../_generated/api";

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
  handler: async (ctx, args) => {
    // Fetch the session to get the workflowId
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error(`Literature review session not found: ${args.sessionId}`);
    }

    if (!session.workflowId) {
      throw new Error(
        `Session ${args.sessionId} does not have an associated workflowId`
      );
    }

    // Update session with confirmed columns and new status
    await ctx.db.patch(args.sessionId, {
      confirmedColumns: args.confirmedColumns,
      status: "searching",
    });

    // Send event to resume the workflow
    // TODO: Ensure `npx convex dev` has been run so components.workflow is available
    await sendEvent(ctx, (components as any).workflow, {
      name: "columnsConfirmed",
      workflowId: session.workflowId as unknown as WorkflowId,
      value: { confirmedColumns: args.confirmedColumns },
    });
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

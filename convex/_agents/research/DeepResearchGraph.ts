/**
 * DeepResearchGraph
 *
 * Orchestrates the deep research workflow using @convex-dev/workflow.
 *
 * Steps:
 * 1. Plan review (LLM generates sub-questions)
 * 2. Checkpoint: await user plan approval via event
 * 3. Execution (retrieve evidence + write response)
 */

import { defineEvent, type WorkflowCtx, WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";

export const workflow = new WorkflowManager(components.workflow);

const planApprovedEvent = defineEvent({
  name: "planApproved",
  validator: v.object({
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
  }),
});

export { planApprovedEvent };

async function trackStep(
  step: WorkflowCtx,
  researchId: string,
  stepType: "planning" | "awaiting_user_input" | "searching",
  status: "pending" | "in_progress" | "completed" | "failed",
  details?: string,
  metadata?: Record<string, unknown>
) {
  const orderMap: Record<typeof stepType, number> = {
    planning: 0,
    awaiting_user_input: 1,
    searching: 2,
  };

  await step.runMutation(internal.research.index.upsertResearchStep, {
    researchId,
    agentType: "research",
    stepType,
    status,
    details,
    metadata,
    order: orderMap[stepType],
  });
}

export const deepResearchWorkflow = workflow
  .define({
    args: {
      query: v.string(),
      notebookId: v.id("notebooks"),
      userId: v.id("users"),
      conversationId: v.id("conversations"),
      assistantMessageId: v.id("messages"),
      planId: v.id("researchPlans"),
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
      smartModel: v.optional(v.string()),
    },
    returns: v.object({
      planId: v.id("researchPlans"),
      runId: v.id("researchRuns"),
    }),
  })
  .handler(async (step, args) => {
    try {
      // Step 1: Planning
      await trackStep(step, args.planId, "planning", "in_progress", "Generating research plan");
      const planResult = await step.runAction(internal.research.workflowSteps.planReview, {
        query: args.query,
        notebookId: args.notebookId,
        userId: args.userId,
        sourcePolicy: args.sourcePolicy,
        smartModel: args.smartModel,
      });

      await step.runMutation(internal.research.index.patchResearchPlanInternal, {
        planId: args.planId,
        patch: {
          subQuestions: planResult.subQuestions.map((sq) => ({
            ...sq,
            status: "pending" as const,
          })),
          status: "draft",
        },
      });

      await step.runMutation(internal.chat.index.updateMessageMetadata, {
        messageId: args.assistantMessageId,
        metadata: {
          researchPlanId: args.planId,
          isResearchPlan: true,
        },
      });

      await trackStep(
        step,
        args.planId,
        "planning",
        "completed",
        `Plan with ${planResult.subQuestions.length} sub-questions`
      );

      // Step 2: Create run row before await to avoid frontend race
      const streamId = await step.runAction(internal.research.index.createStreamInternal, {});
      const runId = await step.runMutation(internal.research.index.createResearchRun, {
        planId: args.planId,
        userId: args.userId,
        notebookId: args.notebookId,
        conversationId: args.conversationId,
        streamId,
      });

      // Step 3: Await approval
      await trackStep(
        step,
        args.planId,
        "awaiting_user_input",
        "in_progress",
        "Waiting for user approval"
      );
      const { modifiedSubQuestions } = await step.awaitEvent(planApprovedEvent);
      await step.runMutation(internal.research.index.patchResearchPlanInternal, {
        planId: args.planId,
        patch: {
          subQuestions:
            modifiedSubQuestions?.map((sq) => ({ ...sq, status: "pending" as const })) ??
            planResult.subQuestions.map((sq) => ({ ...sq, status: "pending" as const })),
          status: "approved",
        },
      });
      await trackStep(step, args.planId, "awaiting_user_input", "completed", "User approved plan");

      // Step 4: Execution
      await step.runMutation(internal.research.index.updateRunProgress, {
        runId,
        status: "running",
      });
      await trackStep(step, args.planId, "searching", "in_progress", "Executing research");

      await step.runAction(internal.research.workflowSteps.executeResearch, {
        runId,
        streamId,
        userId: args.userId,
      });

      await trackStep(step, args.planId, "searching", "completed", "Research execution complete");

      return { planId: args.planId, runId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await step.runMutation(internal.research.index.patchResearchPlanInternal, {
        planId: args.planId,
        patch: { status: "failed" },
      });
      await trackStep(step, args.planId, "searching", "failed", errorMessage);
      throw error;
    }
  });

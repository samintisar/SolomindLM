"use node";

import { internal } from "../../_generated/api";

// These step types are shared across the research agent and literature_review agent.
// Not all steps are used by every agent; the literature review agent uses most of these,
// while the research agent currently uses planning, searching, and generating_report.
export const researchStepTypes = [
  "planning",
  "searching",
  "deduplicating",
  "ranking",
  "screening",
  "extracting",
  "populating",
  "generating_report",
  "awaiting_user_input",
] as const;

export async function trackResearchStep(
  ctx: any,
  researchId: string,
  agentType: "research" | "literature_review",
  stepType: (typeof researchStepTypes)[number],
  status: "pending" | "in_progress" | "completed" | "failed",
  details?: string,
  metadata?: Record<string, number>
) {
  await ctx.runMutation(internal.research.index.upsertResearchStep, {
    researchId,
    agentType,
    stepType,
    status,
    details,
    metadata: metadata
      ? {
          queryCount: metadata.queryCount,
          paperCount: metadata.paperCount,
          includedCount: metadata.includedCount,
          excludedCount: metadata.excludedCount,
        }
      : undefined,
    order: researchStepTypes.indexOf(stepType),
  });
}

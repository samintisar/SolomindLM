"use node";

import { internal } from "../../_generated/api";

export const researchStepTypes = [
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

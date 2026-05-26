"use node";

import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";

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

const stepLog = createServiceLogger("research", "trackResearchStep");

export async function trackResearchStep(
  ctx: ActionCtx,
  researchId: string,
  agentType: "research" | "literature_review",
  stepType: (typeof researchStepTypes)[number],
  status: "pending" | "in_progress" | "completed" | "failed",
  details?: string,
  metadata?: Record<string, unknown>
) {
  try {
    await ctx.runMutation(internal.research.index.upsertResearchStep, {
      researchId,
      agentType,
      stepType,
      status,
      details,
      metadata,
      order: researchStepTypes.indexOf(stepType),
    });
  } catch (err) {
    stepLog.error("track_research_step_failed", err, { researchId, stepType, status });
  }
}

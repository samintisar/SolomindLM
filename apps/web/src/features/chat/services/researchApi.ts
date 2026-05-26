import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

// ============================================================
// Research Plan Hooks
// ============================================================

export function useResearchPlan(planId: string) {
  return useQuery(api.research.index.getPlan, {
    planId: planId as Id<"researchPlans">,
  });
}

export function useLatestRunForPlan(planId: string | null, isApproved: boolean) {
  return useQuery(
    api.research.index.getLatestRunForPlan,
    isApproved && planId ? { planId: planId as Id<"researchPlans"> } : "skip"
  );
}

export function useResearchSteps(
  researchId: string | null,
  notebookId: string | null
) {
  return useQuery(
    api.research.index.getResearchSteps,
    researchId && notebookId
      ? { researchId, notebookId }
      : "skip"
  );
}

export function useApproveResearchPlan() {
  return useMutation(api.research.index.approveResearchPlan);
}

export function useRejectResearchPlan() {
  return useMutation(api.research.index.rejectResearchPlan);
}

export function useStartDeepResearch() {
  return useMutation(api.research.index.startDeepResearch);
}

// ============================================================
// Research Run Evidence
// ============================================================

export function useResearchRunEvidence(runId: string) {
  return useQuery(api.research.index.getRunEvidence, {
    runId: runId as Id<"researchRuns">,
  });
}

import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";

// ============================================================
// Onboarding State Hooks
// ============================================================

export function useOnboardingState() {
  return useQuery(api.onboarding.state.getOnboardingState, {});
}

export function useChecklistProgress() {
  return useQuery(api.onboarding.progress.getChecklistProgress, {});
}

export function useDismissChecklist() {
  return useMutation(api.onboarding.mutations.dismissChecklist);
}

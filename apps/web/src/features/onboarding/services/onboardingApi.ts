import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

// ============================================================
// Onboarding State Hooks
// ============================================================

export function useOnboardingState() {
  return useQuery(api.onboarding.state.getOnboardingState, {});
}

export function useChecklistProgress() {
  return useQuery(api.onboarding.progress.getChecklistProgress, {});
}

export function useTourProgress() {
  return useQuery(api.onboarding.progress.getTourProgress, {});
}

export function useDismissChecklist() {
  return useMutation(api.onboarding.mutations.dismissChecklist);
}

export function useGetOrCreateOnboardingRow() {
  return useMutation(api.onboarding.state.getOrCreateOnboardingRow);
}

export function useStartTour() {
  return useMutation(api.onboarding.mutations.startTour);
}

export function useAdvanceTourStep() {
  return useMutation(api.onboarding.mutations.advanceTourStep);
}

export function useSkipTour() {
  return useMutation(api.onboarding.mutations.skipTour);
}

export function useCompleteTour() {
  return useMutation(api.onboarding.mutations.completeTour);
}

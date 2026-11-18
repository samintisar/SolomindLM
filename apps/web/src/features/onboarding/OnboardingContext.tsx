import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { createContext, useContext } from "react";
import type { StepId } from "./steps";

type ChecklistProgress = FunctionReturnType<
  typeof api.onboarding.progress.getChecklistProgress
>;

export type TourStatus = "pending" | "active" | "skipped" | "completed";

export interface OnboardingContextValue {
  tourStatus: TourStatus;
  currentStepId: StepId | null;
  /** True after all retries on initialization mutations have been exhausted. */
  initFailed: boolean;
  /** Checklist item completion; undefined while loading or signed out. */
  checklist: ChecklistProgress | undefined;
  checklistDismissed: boolean;
  /** Caller-provided: skip the tour. */
  skip: () => Promise<void>;
}

export const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used inside <OnboardingProvider>");
  }
  return ctx;
}

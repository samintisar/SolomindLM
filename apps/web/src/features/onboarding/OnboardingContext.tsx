import { createContext, useContext } from "react";
import type { StepId } from "./steps";

export type TourStatus = "pending" | "active" | "skipped" | "completed";

export interface OnboardingContextValue {
  tourStatus: TourStatus;
  currentStepId: StepId | null;
  /** True after all retries on initialization mutations have been exhausted. */
  initFailed: boolean;
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

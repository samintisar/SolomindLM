import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  OnboardingContext,
  type OnboardingContextValue,
  type TourStatus,
} from "./OnboardingContext";
import type { TourProgress } from "./hooks/useTourProgress";
import type { StepId } from "./steps";

interface Props {
  isAuthenticated: boolean;
  children: ReactNode;
}

type AdvanceTourStepArgs =
  | { expectedCurrentStepId: StepId }
  | { expectedCurrentStepId: StepId; tourNotebookId: Id<"notebooks"> };

export const OnboardingProvider: React.FC<Props> = ({
  isAuthenticated,
  children,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const onboardingState = useQuery(
    api.onboarding.state.getOnboardingState,
    isAuthenticated ? {} : "skip",
  );
  const tourProgress = useQuery(
    api.onboarding.progress.getTourProgress,
    isAuthenticated ? {} : "skip",
  ) as TourProgress | undefined;
  const checklist = useQuery(
    api.onboarding.progress.getChecklistProgress,
    isAuthenticated ? {} : "skip",
  );

  const getOrCreateOnboardingRow = useMutation(
    api.onboarding.state.getOrCreateOnboardingRow,
  );
  const startTour = useMutation(api.onboarding.mutations.startTour);
  const advanceTourStep = useMutation(api.onboarding.mutations.advanceTourStep);
  const skipTourMutation = useMutation(api.onboarding.mutations.skipTour);
  const completeTour = useMutation(api.onboarding.mutations.completeTour);

  const ensuredRowRef = useRef(false);
  const startedRef = useRef(false);
  const advancingRef = useRef(false);
  const pendingNavigationRef = useRef<string | null>(null);
  const completedAllRef = useRef(false);

  const tourStatus: TourStatus =
    onboardingState && "tourStatus" in onboardingState
      ? (onboardingState.tourStatus as TourStatus)
      : "completed";
  const currentStepId: StepId | null =
    onboardingState && "currentStepId" in onboardingState
      ? ((onboardingState.currentStepId as StepId | undefined) ?? null)
      : null;

  // 1. Ensure a userOnboarding row exists (idempotent client-side via ref).
  useEffect(() => {
    if (!isAuthenticated || ensuredRowRef.current) return;
    if (onboardingState === undefined) return; // still loading
    if (onboardingState && "_id" in onboardingState) {
      ensuredRowRef.current = true;
      return;
    }
    ensuredRowRef.current = true;
    void getOrCreateOnboardingRow({});
  }, [isAuthenticated, onboardingState, getOrCreateOnboardingRow]);

  // 2. Auto-launch the tour for pending users.
  useEffect(() => {
    if (!isAuthenticated || startedRef.current) return;
    if (tourStatus !== "pending") return;
    startedRef.current = true;
    void startTour({});
  }, [isAuthenticated, tourStatus, startTour]);

  // 2b. Navigate to /home when step 1 is active so the create-notebook tooltip is visible.
  useEffect(() => {
    if (tourStatus !== "active") return;
    if (currentStepId !== "createNotebook") return;
    if (location.pathname === "/home") return;
    navigate("/home");
  }, [tourStatus, currentStepId, navigate, location.pathname]);

  // 3. Step advancement when the gating boolean for the current step flips.
  useEffect(() => {
    if (advancingRef.current) return;
    if (tourStatus !== "active") return;
    if (!currentStepId || !tourProgress) return;
    const gate = (tourProgress as Record<string, unknown>)[currentStepId];
    if (!gate) return;

    advancingRef.current = true;
    const args: AdvanceTourStepArgs =
      currentStepId === "createNotebook" && tourProgress.tourNotebookId
        ? {
            expectedCurrentStepId: currentStepId,
            tourNotebookId: tourProgress.tourNotebookId,
          }
        : { expectedCurrentStepId: currentStepId };
    void advanceTourStep(args)
      .then(() => {
        if (currentStepId === "createNotebook" && tourProgress.tourNotebookId) {
          pendingNavigationRef.current = String(tourProgress.tourNotebookId);
        }
      })
      .catch(() => {
        /* stale step — server will re-sync via the next reactive query update */
      })
      .finally(() => {
        advancingRef.current = false;
      });
  }, [tourStatus, currentStepId, tourProgress, advanceTourStep]);

  // 4. Cross-route navigation only on the transition out of createNotebook.
  useEffect(() => {
    const target = pendingNavigationRef.current;
    if (!target) return;
    pendingNavigationRef.current = null;
    if (location.pathname.startsWith(`/notebook/${target}`)) return;
    navigate(`/notebook/${target}`);
  }, [currentStepId, navigate, location.pathname]);

  // 5. Auto-complete when all five checklist items are done.
  useEffect(() => {
    if (!checklist) return;
    if (tourStatus === "completed") return;
    if (completedAllRef.current) return;
    const all =
      checklist.createNotebook &&
      checklist.addSource &&
      checklist.askQuestion &&
      checklist.generateArtifact;
    if (!all) return;
    completedAllRef.current = true;
    void completeTour({});
  }, [checklist, tourStatus, completeTour]);

  const skip = useCallback(async () => {
    await skipTourMutation({});
  }, [skipTourMutation]);

  const value = useMemo<OnboardingContextValue>(
    () => ({ tourStatus, currentStepId, skip }),
    [tourStatus, currentStepId, skip],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
};

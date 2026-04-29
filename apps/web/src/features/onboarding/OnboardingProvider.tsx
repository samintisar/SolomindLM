import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  OnboardingContext,
  type OnboardingContextValue,
  type TourStatus,
} from "./OnboardingContext";
import type { StepId } from "./steps";

interface Props {
  isAuthenticated: boolean;
  children: ReactNode;
}

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
  );
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

  const [studioOpen, setStudioOpen] = useState(false);
  const ensuredRowRef = useRef(false);
  const startedRef = useRef(false);
  const advancingRef = useRef(false);
  const navigatedAfterCreateRef = useRef(false);
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

  // 3. Step advancement when the gating boolean for the current step flips.
  useEffect(() => {
    if (advancingRef.current) return;
    if (tourStatus !== "active") return;
    if (!currentStepId || !tourProgress) return;
    const gate =
      currentStepId === "openStudio"
        ? studioOpen
        : (tourProgress as Record<string, unknown>)[currentStepId];
    if (!gate) return;

    advancingRef.current = true;
    const args: { expectedCurrentStepId: StepId; tourNotebookId?: string } = {
      expectedCurrentStepId: currentStepId,
    };
    if (
      currentStepId === "createNotebook" &&
      (tourProgress as { tourNotebookId?: string }).tourNotebookId
    ) {
      args.tourNotebookId = (tourProgress as { tourNotebookId?: string })
        .tourNotebookId as string;
    }
    void (advanceTourStep as (a: typeof args) => Promise<void>)(args)
      .catch(() => {
        /* stale step — server will re-sync via the next reactive query update */
      })
      .finally(() => {
        advancingRef.current = false;
      });
  }, [tourStatus, currentStepId, tourProgress, studioOpen, advanceTourStep]);

  // 4. Cross-route navigation after createNotebook completes.
  useEffect(() => {
    if (navigatedAfterCreateRef.current) return;
    if (!currentStepId) return;
    if (currentStepId === "createNotebook") return;
    const tourNotebookId = (tourProgress as { tourNotebookId?: string } | null)
      ?.tourNotebookId;
    if (!tourNotebookId) return;
    if (location.pathname.startsWith(`/notebook/${tourNotebookId}`)) {
      navigatedAfterCreateRef.current = true;
      return;
    }
    if (tourStatus !== "active") return;
    navigatedAfterCreateRef.current = true;
    navigate(`/notebook/${tourNotebookId}`);
  }, [tourStatus, currentStepId, tourProgress, location.pathname, navigate]);

  // 5. Auto-complete when all five checklist items are done.
  useEffect(() => {
    if (!checklist) return;
    if (tourStatus === "completed") return;
    if (completedAllRef.current) return;
    const all =
      checklist.createNotebook &&
      checklist.addSource &&
      checklist.askQuestion &&
      checklist.openStudio &&
      checklist.generateArtifact;
    if (!all) return;
    completedAllRef.current = true;
    void completeTour({});
  }, [checklist, tourStatus, completeTour]);

  const notifyStudioOpen = useCallback(() => setStudioOpen(true), []);
  const skip = useCallback(async () => {
    await skipTourMutation({});
  }, [skipTourMutation]);

  const value = useMemo<OnboardingContextValue>(
    () => ({ tourStatus, currentStepId, notifyStudioOpen, skip }),
    [tourStatus, currentStepId, notifyStudioOpen, skip],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
};

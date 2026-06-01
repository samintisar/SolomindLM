import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { TourProgress } from "./hooks/useTourProgress";
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

type AdvanceTourStepArgs =
  | { expectedCurrentStepId: StepId }
  | { expectedCurrentStepId: StepId; tourNotebookId: Id<"notebooks"> };

function isStepMismatchError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Step mismatch:");
}

function logOnboardingError(action: string, error: unknown) {
  console.error(`[onboarding] ${action}`, error);
}

export const OnboardingProvider: React.FC<Props> = ({ isAuthenticated, children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const onboardingState = useQuery(
    api.onboarding.state.getOnboardingState,
    isAuthenticated ? {} : "skip"
  );
  const tourProgress = useQuery(
    api.onboarding.progress.getTourProgress,
    isAuthenticated ? {} : "skip"
  ) as TourProgress | undefined;
  const checklist = useQuery(
    api.onboarding.progress.getChecklistProgress,
    isAuthenticated ? {} : "skip"
  );

  const getOrCreateOnboardingRow = useMutation(api.onboarding.state.getOrCreateOnboardingRow);
  const startTour = useMutation(api.onboarding.mutations.startTour);
  const advanceTourStep = useMutation(api.onboarding.mutations.advanceTourStep);
  const skipTourMutation = useMutation(api.onboarding.mutations.skipTour);
  const completeTour = useMutation(api.onboarding.mutations.completeTour);

  const ensuredRowRef = useRef(false);
  const startedRef = useRef(false);
  const advancingRef = useRef(false);
  const pendingNavigationRef = useRef<string | null>(null);
  const completedAllRef = useRef(false);
  const createRowRetryAttemptsRef = useRef(0);
  const startTourRetryAttemptsRef = useRef(0);
  const advanceTourRetryAttemptsRef = useRef(0);
  const completeTourRetryAttemptsRef = useRef(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [initFailed, setInitFailed] = useState(false);

  const tourStatus: TourStatus =
    onboardingState && "tourStatus" in onboardingState
      ? (onboardingState.tourStatus as TourStatus)
      : "completed";
  const currentStepId: StepId | null =
    onboardingState && "currentStepId" in onboardingState
      ? ((onboardingState.currentStepId as StepId | undefined) ?? null)
      : null;
  const hasOnboardingRow = !!onboardingState && "_id" in onboardingState;

  // 1. Ensure a userOnboarding row exists (idempotent client-side via ref).
  useEffect(() => {
    if (!isAuthenticated || ensuredRowRef.current) return;
    if (onboardingState === undefined) return; // still loading
    if (hasOnboardingRow) {
      ensuredRowRef.current = true;
      return;
    }
    ensuredRowRef.current = true;
    void getOrCreateOnboardingRow({})
      .then(() => {
        ensuredRowRef.current = true;
        createRowRetryAttemptsRef.current = 0;
      })
      .catch((error) => {
        ensuredRowRef.current = false;
        logOnboardingError("failed to create onboarding row", error);
        if (createRowRetryAttemptsRef.current < 3) {
          createRowRetryAttemptsRef.current += 1;
          setRetryNonce((n) => n + 1);
        } else {
          setInitFailed(true);
        }
      });
  }, [isAuthenticated, onboardingState, getOrCreateOnboardingRow, hasOnboardingRow, retryNonce]);

  // 2. Auto-launch the tour for pending users.
  useEffect(() => {
    if (!isAuthenticated || startedRef.current) return;
    if (!hasOnboardingRow) return;
    if (tourStatus !== "pending") return;
    startedRef.current = true;
    void startTour({})
      .then(() => {
        startTourRetryAttemptsRef.current = 0;
      })
      .catch((error) => {
        startedRef.current = false;
        logOnboardingError("failed to start tour", error);
        if (startTourRetryAttemptsRef.current < 3) {
          startTourRetryAttemptsRef.current += 1;
          setRetryNonce((n) => n + 1);
        } else {
          setInitFailed(true);
        }
      });
  }, [isAuthenticated, hasOnboardingRow, tourStatus, startTour, retryNonce]);

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
        advanceTourRetryAttemptsRef.current = 0;
        if (currentStepId === "createNotebook" && tourProgress.tourNotebookId) {
          pendingNavigationRef.current = String(tourProgress.tourNotebookId);
        }
      })
      .catch((error) => {
        if (isStepMismatchError(error)) {
          // stale step — server will re-sync via the next reactive query update
          return;
        }
        logOnboardingError("failed to advance tour step", error);
        if (advanceTourRetryAttemptsRef.current < 3) {
          advanceTourRetryAttemptsRef.current += 1;
          setRetryNonce((n) => n + 1);
        } else {
          setInitFailed(true);
        }
      })
      .finally(() => {
        advancingRef.current = false;
      });
  }, [tourStatus, currentStepId, tourProgress, advanceTourStep, retryNonce]);

  // 4. Cross-route navigation only on the transition out of createNotebook.
  useEffect(() => {
    const target = pendingNavigationRef.current;
    if (!target) return;
    pendingNavigationRef.current = null;
    if (location.pathname.startsWith(`/notebook/${target}`)) return;
    navigate(`/notebook/${target}`);
  }, [currentStepId, navigate, location.pathname]);

  // 5. Auto-complete when all four checklist items are done.
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
    void completeTour({})
      .then(() => {
        completeTourRetryAttemptsRef.current = 0;
      })
      .catch((error) => {
        completedAllRef.current = false;
        logOnboardingError("failed to complete tour", error);
        if (completeTourRetryAttemptsRef.current < 3) {
          completeTourRetryAttemptsRef.current += 1;
          setRetryNonce((n) => n + 1);
        } else {
          setInitFailed(true);
        }
      });
  }, [checklist, tourStatus, completeTour, retryNonce]);

  const skip = useCallback(async () => {
    await skipTourMutation({});
  }, [skipTourMutation]);

  const value = useMemo<OnboardingContextValue>(
    () => ({ tourStatus, currentStepId, initFailed, skip }),
    [tourStatus, currentStepId, initFailed, skip]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
};

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { isNativeShell } from "@/utils/platformDetection";
import { AI_CONSENT_VERSION } from "./aiConsentCopy";
import {
  type AiConsentState,
  type DefiniteAiConsentState,
  resolveAiConsentState,
} from "./resolveAiConsentState";

/** Which AI-consent screen (if any) the mobile shell must show before the app. */
export function useAiConsentState(): AiConsentState {
  const inShell = isNativeShell();
  const { isAuthenticated, isLoading } = useAuth();
  const record = useQuery(
    api.userPreferences.index.getMyAiConsent,
    inShell && isAuthenticated ? {} : "skip"
  );
  const previous = useRef<DefiniteAiConsentState | null>(null);

  const state = resolveAiConsentState({
    inShell,
    authLoading: isLoading,
    isAuthenticated,
    record,
    previous: previous.current,
    currentVersion: AI_CONSENT_VERSION,
  });

  useEffect(() => {
    if (state === "needsConsent" || state === "declined" || state === "granted") {
      previous.current = state;
    }
  }, [state]);

  return state;
}

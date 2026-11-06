import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { AppShellFallback } from "@/shell/AppShellFallback";
import { useAiConsentState } from "./useAiConsentState";
import { useReportAiConsentToShell } from "./useReportAiConsentToShell";

// Only the mobile shell ever shows these screens; keep them out of the web entry chunk.
const AiConsentScreen = lazy(() =>
  import("./AiConsentScreen").then((m) => ({ default: m.AiConsentScreen }))
);
const AiFeaturesOffScreen = lazy(() =>
  import("./AiFeaturesOffScreen").then((m) => ({ default: m.AiFeaturesOffScreen }))
);

/**
 * In the mobile shell, nothing below this renders until the user has allowed AI data sharing,
 * so no feature can send content to a provider first. On the web it is a pass-through.
 */
export function AiConsentGate({ children }: { children: ReactNode }) {
  const state = useAiConsentState();
  useReportAiConsentToShell(state);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (state !== "declined") setReviewing(false);
  }, [state]);

  if (state === "loading") return <AppShellFallback />;
  if (state === "needsConsent") {
    return (
      <Suspense fallback={<AppShellFallback />}>
        <AiConsentScreen />
      </Suspense>
    );
  }
  if (state === "declined") {
    return (
      <Suspense fallback={<AppShellFallback />}>
        {reviewing ? (
          <AiConsentScreen onDeclined={() => setReviewing(false)} />
        ) : (
          <AiFeaturesOffScreen onReview={() => setReviewing(true)} />
        )}
      </Suspense>
    );
  }
  return <>{children}</>;
}

import { lazy, type ReactNode, Suspense, useState } from "react";
import { FullScreenSpinner } from "@/shared/components/FullScreenSpinner";
import { importOrReloadOnce } from "@/shared/utils/importOrReloadOnce";
import { useAiConsentState } from "./useAiConsentState";
import { useReportAiConsentToShell } from "./useReportAiConsentToShell";

// Only the mobile shell ever shows these screens; keep them out of the web entry chunk.
const AiConsentScreen = lazy(() =>
  importOrReloadOnce(() => import("./AiConsentScreen"), "ai-consent-screen-reloaded").then((m) => ({
    default: m.AiConsentScreen,
  }))
);
const AiFeaturesOffScreen = lazy(() =>
  importOrReloadOnce(() => import("./AiFeaturesOffScreen"), "ai-features-off-reloaded").then(
    (m) => ({ default: m.AiFeaturesOffScreen })
  )
);

/**
 * In the mobile shell, nothing below this renders until the user has allowed AI data sharing,
 * so no feature can send content to a provider first. On the web it is a pass-through.
 */
export function AiConsentGate({ children }: { children: ReactNode }) {
  const state = useAiConsentState();
  useReportAiConsentToShell(state);
  const [reviewing, setReviewing] = useState(false);
  // Leaving "declined" ends review mode, so a later Turn off lands on the off screen.
  if (reviewing && state !== "declined") setReviewing(false);

  if (state === "loading") return <FullScreenSpinner />;
  if (state === "needsConsent") {
    return (
      <Suspense fallback={<FullScreenSpinner />}>
        <AiConsentScreen />
      </Suspense>
    );
  }
  if (state === "declined") {
    return (
      <Suspense fallback={<FullScreenSpinner />}>
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

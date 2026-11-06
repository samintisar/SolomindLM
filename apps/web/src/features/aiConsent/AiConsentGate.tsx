import { type ReactNode, useEffect, useState } from "react";
import { AppShellFallback } from "@/shell/AppShellFallback";
import { AiConsentScreen } from "./AiConsentScreen";
import { AiFeaturesOffScreen } from "./AiFeaturesOffScreen";
import { useAiConsentState } from "./useAiConsentState";

/**
 * In the mobile shell, nothing below this renders until the user has allowed AI data sharing,
 * so no feature can send content to a provider first. On the web it is a pass-through.
 */
export function AiConsentGate({ children }: { children: ReactNode }) {
  const state = useAiConsentState();
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (state !== "declined") setReviewing(false);
  }, [state]);

  if (state === "loading") return <AppShellFallback />;
  if (state === "needsConsent") return <AiConsentScreen />;
  if (state === "declined") {
    return reviewing ? (
      <AiConsentScreen onDeclined={() => setReviewing(false)} />
    ) : (
      <AiFeaturesOffScreen onReview={() => setReviewing(true)} />
    );
  }
  return <>{children}</>;
}

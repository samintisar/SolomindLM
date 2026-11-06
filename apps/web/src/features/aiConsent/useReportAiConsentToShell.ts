import { useEffect } from "react";
import { getNativeWebViewBridge } from "@/utils/platformDetection";
import type { AiConsentState } from "./resolveAiConsentState";

/**
 * Tells the native shell whether AI sharing is allowed, so native UI that sits outside the web
 * gate (the upload button) stays hidden until the user consents. `loading` and `notApplicable`
 * report nothing: the shell keeps its last value (hidden by default).
 */
export function useReportAiConsentToShell(state: AiConsentState) {
  const granted =
    state === "granted" ? true : state === "needsConsent" || state === "declined" ? false : null;

  useEffect(() => {
    if (granted === null) return;
    getNativeWebViewBridge()?.postMessage(
      JSON.stringify({ type: "shell-web:ai-consent", granted })
    );
  }, [granted]);
}

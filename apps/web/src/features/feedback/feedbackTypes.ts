import { isNativeShell } from "@/utils/platformDetection";
import { getLastRequestId } from "./lastRequestId";

export type FeedbackType = "bug" | "feature";

export const MAX_FEEDBACK_TEXT = 5000;

export interface FeedbackContextCapture {
  route: string;
  surface: "web" | "mobile";
  appVersion: string;
  lastRequestId?: string;
}

export interface FeedbackDraft {
  type: FeedbackType;
  body: string;
  detail: string;
}

export function captureFeedbackContext(
  loc: { pathname: string; search: string } = window.location
): FeedbackContextCapture {
  return {
    route: `${loc.pathname}${loc.search ?? ""}`,
    surface: isNativeShell() ? "mobile" : "web",
    appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "unknown",
    lastRequestId: getLastRequestId(),
  };
}

export function validateFeedbackDraft(
  d: { body: string }
): { ok: true } | { ok: false; error: string } {
  const body = d.body.trim();
  if (!body) return { ok: false, error: "Enter a description first" };
  if (body.length > MAX_FEEDBACK_TEXT) {
    return { ok: false, error: `Keep it under ${MAX_FEEDBACK_TEXT} characters` };
  }
  return { ok: true };
}

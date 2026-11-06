export type AiConsentState = "notApplicable" | "loading" | "needsConsent" | "declined" | "granted";

/** A definite answer from the server, the only states worth holding through a blip. */
export type DefiniteAiConsentState = "needsConsent" | "declined" | "granted";

/** Shape returned by `api.userPreferences.index.getMyAiConsent`. */
export type AiConsentRecord =
  | { signedIn: false }
  | { signedIn: true; version: number | null; declined: boolean };

export interface ResolveAiConsentInput {
  inShell: boolean;
  authLoading: boolean;
  isAuthenticated: boolean;
  /** `undefined` while the query is pending or skipped. */
  record: AiConsentRecord | undefined;
  /** Last definite state this session, held while auth or the query momentarily reads signed out. */
  previous: DefiniteAiConsentState | null;
  currentVersion: number;
}

export function resolveAiConsentState({
  inShell,
  authLoading,
  isAuthenticated,
  record,
  previous,
  currentVersion,
}: ResolveAiConsentInput): AiConsentState {
  if (!inShell) return "notApplicable";
  if (authLoading) return previous ?? "loading";
  // Truly signed out: AppShell redirects to sign-in, and nothing can reach a provider signed out.
  if (!isAuthenticated) return previous ?? "notApplicable";
  if (record === undefined || !record.signedIn) return previous ?? "loading";
  if (record.version === currentVersion) return "granted";
  if (record.declined) return "declined";
  return "needsConsent";
}

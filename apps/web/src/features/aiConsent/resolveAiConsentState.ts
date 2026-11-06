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
  // Signed out: let AppShell's own flow handle it (redirect to sign-in). A held consent or off screen
  // stays up through a blip so the app doesn't flash; a held "granted" becomes notApplicable, which
  // renders the same app but tells the native shell to hide its upload button if the session ended.
  if (!isAuthenticated)
    return previous === "needsConsent" || previous === "declined" ? previous : "notApplicable";
  if (record === undefined || !record.signedIn) return previous ?? "loading";
  if (record.version === currentVersion) return "granted";
  if (record.declined) return "declined";
  return "needsConsent";
}

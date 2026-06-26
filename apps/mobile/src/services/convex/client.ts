import { ConvexReactClient } from "convex/react";
import Constants from "expo-constants";

/**
 * Valid absolute URL so `ConvexReactClient` can construct during SSR / static routes when
 * `EXPO_PUBLIC_CONVEX_URL` is unset in dev. Do not use for real traffic — set `.env` instead.
 */
const DEV_MISSING_CONVEX_URL = "https://__configure_expo_public_convex_url__.convex.cloud";

function readConfiguredConvexUrl(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_CONVEX_URL?.trim().replace(/^["']|["']$/g, "");
  const fromExtra = (Constants.expoConfig?.extra?.convexUrl as string | undefined)
    ?.trim()
    .replace(/^["']|["']$/g, "");
  const url = fromEnv || fromExtra;
  return url ? url : null;
}

function getConvexUrl(): string {
  const configured = readConfiguredConvexUrl();
  if (configured) return configured;
  if (__DEV__) {
    console.warn("[SolomindLM] Set EXPO_PUBLIC_CONVEX_URL in apps/mobile/.env (see .env.example).");
    return DEV_MISSING_CONVEX_URL;
  }
  throw new Error(
    "[SolomindLM] EXPO_PUBLIC_CONVEX_URL is required for production builds (set in EAS secrets or .env)."
  );
}

/** Same URL passed to ConvexReactClient — used for @convex-dev/auth storage namespace. */
export const convexDeploymentUrl = getConvexUrl();

/** True when URL came from env or app config (not the dev placeholder). */
export const isConvexDeploymentConfigured = readConfiguredConvexUrl() !== null;

export const convexClient = new ConvexReactClient(convexDeploymentUrl, {
  unsavedChangesWarning: false,
});

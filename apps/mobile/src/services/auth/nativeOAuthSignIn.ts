import { log } from "@mobile/utils/logger";
import { maybeCompleteAuthSession, openAuthSessionAsync } from "expo-web-browser";
import { Platform } from "react-native";

maybeCompleteAuthSession();

type SignInFn = (
  provider: string,
  args?: { redirectTo?: string; code?: string } & Record<string, string>
) => Promise<{ redirect?: URL | null; signingIn?: boolean }>;

/**
 * App scheme from app.json — used for OAuth callback into the native shell.
 * A fixed literal instead of `makeRedirectUri({ scheme })`: that helper calls
 * `Linking.createURL`, which — while connected to a Metro dev server — embeds the
 * dev server's current LAN host into the URL (e.g. `solomindlm://192.168.x.x:8081`)
 * instead of a bare `solomindlm://`. That makes the redirect target change with
 * whatever network the dev machine is on and differ from EAS-built binaries,
 * which is unnecessary risk in an OAuth round trip that already goes through
 * Convex Auth's server-side redirect allowlist.
 */
export function getNativeOAuthRedirectUri(): string {
  return "solomindlm://";
}

/**
 * Convex Auth RN pattern: signIn → openAuthSessionAsync → signIn with code.
 * @see https://labs.convex.dev/auth/api_reference/react
 */
export async function completeNativeOAuthSignIn(
  provider: "google",
  signIn: SignInFn
): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error("Native OAuth is not available on web");
  }

  const redirectTo = getNativeOAuthRedirectUri();
  const { redirect } = await signIn(provider, { redirectTo });
  if (!redirect) {
    throw new Error("OAuth sign-in did not return a redirect URL");
  }

  if (__DEV__) {
    log.info("[NativeOAuth] Opening auth session", { redirectTo, authUrl: redirect.toString() });
  }

  const result = await openAuthSessionAsync(redirect.toString(), redirectTo);

  if (__DEV__) {
    log.info("[NativeOAuth] Auth session result", {
      type: result.type,
      url: "url" in result ? result.url : undefined,
    });
  }

  if (result.type === "cancel" || result.type === "dismiss") {
    throw new Error("Sign-in cancelled");
  }
  if (result.type !== "success") {
    throw new Error("Sign-in failed");
  }

  const code = new URL(result.url).searchParams.get("code");
  if (!code) {
    throw new Error("OAuth callback did not include a code");
  }

  await signIn(provider, { code });
}

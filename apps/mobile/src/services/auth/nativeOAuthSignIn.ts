import { makeRedirectUri } from "expo-auth-session";
import { maybeCompleteAuthSession, openAuthSessionAsync } from "expo-web-browser";
import { Platform } from "react-native";

maybeCompleteAuthSession();

type SignInFn = (
  provider: string,
  args?: { redirectTo?: string; code?: string } & Record<string, string>
) => Promise<{ redirect?: URL | null; signingIn?: boolean }>;

/** App scheme from app.json — used for OAuth callback into the native shell. */
export function getNativeOAuthRedirectUri(): string {
  return makeRedirectUri({ scheme: "solomindlm" });
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

  const result = await openAuthSessionAsync(redirect.toString(), redirectTo);
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

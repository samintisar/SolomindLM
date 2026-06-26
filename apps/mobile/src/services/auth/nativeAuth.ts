/**
 * Native ConvexAuthProvider (expo-secure-store) is the auth source of truth.
 * OAuth uses expo-web-browser + makeRedirectUri; WebView mirrors injected JWTs only.
 */
export type NativeAuthStatus = "native";

export function getNativeAuthStatus(): NativeAuthStatus {
  return "native";
}

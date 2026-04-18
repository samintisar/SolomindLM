/**
 * Primary sign-in runs in the WebView; `MobileConvexAuthBridge` + `NativeConvexAuthBridgeProvider`
 * copy JWT + refresh into SecureStore so native Convex hooks match the web session.
 */
export type NativeAuthStatus = "webview";

export function getNativeAuthStatus(): NativeAuthStatus {
  return "webview";
}

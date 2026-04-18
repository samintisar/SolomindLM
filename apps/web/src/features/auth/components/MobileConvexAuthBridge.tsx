import { useEffect, useRef } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { convexAuthStorageKeys } from "@/utils/convexAuthStorageKeys";
import { getNativeWebViewBridge, isNativeShell } from "@/utils/platformDetection";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;

/**
 * When running inside the Expo WebView, mirrors Convex Auth tokens from `localStorage`
 * to the native shell via `ReactNativeWebView.postMessage` (see mobile `NativeConvexAuthBridgeProvider`).
 */
export function MobileConvexAuthBridge() {
  const token = useAuthToken();
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeShell() || !CONVEX_URL) return;
    const bridge = getNativeWebViewBridge();
    if (!bridge) return;

    if (token === null) {
      prev.current = null;
      return;
    }
    if (token === prev.current) return;
    prev.current = token;

    const { refresh } = convexAuthStorageKeys(CONVEX_URL);
    const refreshToken = localStorage.getItem(refresh);
    if (!refreshToken) return;

    bridge.postMessage(
      JSON.stringify({
        type: "convex-auth-tokens",
        jwt: token,
        refresh: refreshToken,
      })
    );
  }, [token]);

  return null;
}

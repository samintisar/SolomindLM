declare global {
  interface Window {
    __IS_NATIVE_SHELL__?: boolean;
    /** Latest JWT mirrored from native inject (read before localStorage on cold sync). */
    __SOLOMIND_SHELL_AUTH__?: { jwt: string | null; deploymentUrl: string };
    /** Injected by `react-native-webview` when the page runs inside the mobile shell. */
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

export function isNativeShell(): boolean {
  return typeof window !== "undefined" && !!window.__IS_NATIVE_SHELL__;
}

/**
 * Whether this surface may offer subscription purchases (prices, Stripe checkout,
 * "Upgrade to Pro" CTAs). Off inside the native shell: App Store guideline 3.1.1
 * requires digital subscriptions sold in an iOS app to use in-app purchase, so the
 * shell must not steer users to Stripe. Existing subscribers keep Pro either way.
 */
export function canOfferPurchases(): boolean {
  return !isNativeShell();
}

export function getNativeWebViewBridge(): { postMessage: (message: string) => void } | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ReactNativeWebView;
}

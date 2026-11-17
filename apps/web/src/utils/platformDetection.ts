declare global {
  interface Window {
    __IS_NATIVE_SHELL__?: boolean;
    /** Set by native builds before content loads; `iap` when the shell can run App Store purchases. */
    __SHELL_CAPABILITIES__?: { iap?: boolean };
    /** Latest JWT mirrored from native inject (read before localStorage on cold sync). */
    __SOLOMIND_SHELL_AUTH__?: { jwt: string | null; deploymentUrl: string };
    /** Injected by `react-native-webview` when the page runs inside the mobile shell. */
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

export function isNativeShell(): boolean {
  return typeof window !== "undefined" && !!window.__IS_NATIVE_SHELL__;
}

/** True in a native shell build that can run App Store in-app purchases. */
export function shellSupportsIap(): boolean {
  return isNativeShell() && window.__SHELL_CAPABILITIES__?.iap === true;
}

export type PurchaseChannel = "stripe" | "app_store" | "none";

/**
 * How this surface sells Pro. The web uses Stripe. Inside the iOS app, App Store guideline 3.1.1
 * requires in-app purchase, so builds that support it use the App Store and older builds (and the
 * Android shell) sell nothing. Existing subscribers keep Pro everywhere.
 */
export function purchaseChannel(): PurchaseChannel {
  if (!isNativeShell()) return "stripe";
  return shellSupportsIap() ? "app_store" : "none";
}

/** Whether this surface may show prices and "Upgrade to Pro" calls to action. */
export function canOfferPurchases(): boolean {
  return purchaseChannel() !== "none";
}

export function getNativeWebViewBridge(): { postMessage: (message: string) => void } | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ReactNativeWebView;
}

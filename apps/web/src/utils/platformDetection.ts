declare global {
  interface Window {
    __IS_NATIVE_SHELL__?: boolean;
    __MOBILE_AUTH_TOKEN__?: string;
    /** Injected by `react-native-webview` when the page runs inside the mobile shell. */
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

export function isNativeShell(): boolean {
  return typeof window !== "undefined" && !!window.__IS_NATIVE_SHELL__;
}

export function getMobileAuthToken(): string | null {
  if (!isNativeShell()) return null;
  return window.__MOBILE_AUTH_TOKEN__ ?? null;
}

export function getNativeWebViewBridge(): { postMessage: (message: string) => void } | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ReactNativeWebView;
}

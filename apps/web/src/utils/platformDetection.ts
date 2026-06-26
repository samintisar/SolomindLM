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

export function getNativeWebViewBridge(): { postMessage: (message: string) => void } | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ReactNativeWebView;
}

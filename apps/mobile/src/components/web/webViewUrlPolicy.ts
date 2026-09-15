/** Dev origins for the Vite web app when loaded from Android emulator / LAN. */
const MOBILE_DEV_WEB_ORIGINS = [
  "http://10.0.2.2:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
] as const;

const LAN_VITE_HOST = /^192\.168\.\d{1,3}\.\d{1,3}$/;

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Only the web app origin stays in the WebView — OAuth runs in expo-web-browser.
 *
 * Compares parsed `URL.origin` values, never raw string prefixes: a naive
 * `url.startsWith(webBaseUrl)` check is bypassable via URL userinfo
 * (`https://<trusted-host>@evil.com/` starts with the trusted host as a
 * string, but a real browser resolves it to host `evil.com`).
 *
 * Restricted to http(s) schemes: for every non-special scheme (`javascript:`,
 * `data:`, `file:`, ...) `URL.origin` collapses to the spec sentinel `"null"`,
 * which would otherwise make a non-http(s) `webBaseUrl` compare equal to any
 * URL of that scheme. Expo's winter runtime replaces the global `URL` with
 * `whatwg-url-minimum` (`expo/src/winter/url.ts`, installed at app start via
 * `expo/src/winter/runtime.native.ts`) — a spec-compliant parser, the same
 * one these tests run on via Node's `URL`, so there is no test/production
 * parser divergence to account for here.
 *
 * Dev/LAN origins are only trusted in development builds (`__DEV__`) — this
 * function is the sole gate before the WebView is handed the user's Convex
 * auth JWT (see `buildWebViewAuthInjectScript`), so trusting a plaintext LAN
 * origin in a release build would make that origin a token-disclosure surface.
 * Note `webBaseUrl` itself (the configured web app origin, from
 * `EXPO_PUBLIC_WEB_URL`) is trusted unconditionally, including over plain
 * http — this `__DEV__` gate covers only the hardcoded dev/LAN origins above,
 * not a misconfigured or intentionally-plaintext configured base.
 */
export function shouldLoadUrlInWebView(url: string, webBaseUrl: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const parsedBase = parseUrl(webBaseUrl);
  if (parsedBase && parsed.origin === parsedBase.origin) return true;

  if (__DEV__) {
    for (const origin of MOBILE_DEV_WEB_ORIGINS) {
      if (parsed.origin === origin) return true;
    }

    if (
      parsed.protocol === "http:" &&
      parsed.port === "5173" &&
      LAN_VITE_HOST.test(parsed.hostname)
    ) {
      return true;
    }
  }

  return false;
}

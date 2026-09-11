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
 */
export function shouldLoadUrlInWebView(url: string, webBaseUrl: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;

  const parsedBase = parseUrl(webBaseUrl);
  if (parsedBase && parsed.origin === parsedBase.origin) return true;

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

  return false;
}

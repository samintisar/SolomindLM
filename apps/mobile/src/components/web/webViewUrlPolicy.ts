/** Dev origins for the Vite web app when loaded from Android emulator / LAN. */
const MOBILE_DEV_WEB_ORIGINS = [
  "http://10.0.2.2:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
] as const;

const LAN_VITE_ORIGIN = /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:5173/;

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Only the web app origin stays in the WebView — OAuth runs in expo-web-browser. */
export function shouldLoadUrlInWebView(url: string, webBaseUrl: string): boolean {
  if (url.startsWith(webBaseUrl)) return true;

  for (const origin of MOBILE_DEV_WEB_ORIGINS) {
    if (url.startsWith(origin)) return true;
  }

  if (LAN_VITE_ORIGIN.test(url)) return true;

  const parsed = parseUrl(url);
  if (!parsed) return false;

  const parsedBase = parseUrl(webBaseUrl);
  if (parsedBase && parsed.origin === parsedBase.origin) return true;

  return false;
}

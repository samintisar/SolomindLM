/**
 * Canonical form for matching discovery result URLs to notebook `Source.url` values.
 * Avoids "Added" staying true after a source is removed because of minor URL differences.
 */
export function normalizeSourceUrlForNotebookMatch(url: string): string {
  const raw = url.trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.href;
  } catch {
    return raw;
  }
}

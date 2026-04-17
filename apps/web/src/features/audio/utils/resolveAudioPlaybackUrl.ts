/**
 * Convex HTTP routes for audio (e.g. GET /audio/:storageId) are served from the
 * deployment's .site URL. Legacy rows may store `/audio/<id>` — that is not valid
 * on localhost unless Vite's proxy is configured; prefer an absolute .site URL
 * whenever env is available (dev and prod). CORS is set on convex/http /audio.
 */
export function resolveAudioPlaybackUrl(audioUrl: string): string {
  const trimmed = audioUrl.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const path = trimmed.startsWith("/") ? trimmed : `/audio/${trimmed}`;

  const site =
    import.meta.env.VITE_CONVEX_SITE_URL ||
    import.meta.env.VITE_CONVEX_URL?.replace(".cloud", ".site");

  if (site) {
    return new URL(path, site).href;
  }

  if (import.meta.env.DEV) {
    console.warn(
      "[resolveAudioPlaybackUrl] Set VITE_CONVEX_URL or VITE_CONVEX_SITE_URL so /audio/ URLs resolve; using same-origin path (needs Vite /audio proxy):",
      path
    );
  } else {
    console.warn(
      "[resolveAudioPlaybackUrl] VITE_CONVEX_SITE_URL / VITE_CONVEX_URL missing; relative audio URL may fail:",
      path
    );
  }

  return path;
}

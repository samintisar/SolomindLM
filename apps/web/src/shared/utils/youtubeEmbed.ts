const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]+$/;

/**
 * True for youtube.com, m.youtube.com, www.youtube.com, youtu.be, etc.
 */
export function isYouTubeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
}

/**
 * Extract YouTube video ID from common watch/share/embed URL shapes.
 * Only accepts URLs on YouTube hostnames (rejects arbitrary sites with a `v=` query param).
 */
export function extractYouTubeVideoId(url: string | undefined): string | null {
  if (!url?.trim()) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  if (!isYouTubeHostname(parsed.hostname)) return null;

  const host = parsed.hostname.toLowerCase();

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return id && YOUTUBE_VIDEO_ID.test(id) ? id : null;
  }

  const shorts = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shorts) return shorts[1];

  const embed = parsed.pathname.match(/^\/embed\/([a-zA-Z0-9_-]+)/);
  if (embed) return embed[1];

  const live = parsed.pathname.match(/^\/live\/([a-zA-Z0-9_-]+)/);
  if (live) return live[1];

  const watchId = parsed.searchParams.get("v");
  if (watchId && YOUTUBE_VIDEO_ID.test(watchId)) return watchId;

  return null;
}

export function youTubeEmbedSrc(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

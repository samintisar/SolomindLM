/**
 * Extract YouTube video ID from common watch/share/embed URL shapes.
 */
export function extractYouTubeVideoId(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();

  const youtuBe = u.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (youtuBe) return youtuBe[1];

  const shorts = u.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shorts) return shorts[1];

  const embed = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
  if (embed) return embed[1];

  const live = u.match(/youtube\.com\/live\/([a-zA-Z0-9_-]+)/);
  if (live) return live[1];

  const watchV = u.match(/[?&]v=([a-zA-Z0-9_-]+)/);
  if (watchV) return watchV[1];

  return null;
}

export function youTubeEmbedSrc(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

import { extractYouTubeVideoId, youTubeEmbedSrc } from "@/shared/utils/youtubeEmbed";

interface YouTubeVideoPreviewProps {
  url: string;
  title?: string;
}

export function YouTubeVideoPreview({ url, title = "YouTube video" }: YouTubeVideoPreviewProps) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  return (
    <section
      aria-label="YouTube video preview"
      className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm ring-1 ring-border/30"
      data-testid="youtube-video-preview"
    >
      <div className="relative aspect-video w-full bg-muted">
        <iframe
          src={youTubeEmbedSrc(videoId)}
          title={title}
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </section>
  );
}

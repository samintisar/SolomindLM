import { youTubeEmbedSrc } from "@/shared/utils/youtubeEmbed";

interface YouTubeVideoPreviewProps {
  videoId: string;
  title?: string;
}

export function YouTubeVideoPreview({
  videoId,
  title = "YouTube video",
}: YouTubeVideoPreviewProps) {
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
          loading="lazy"
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </section>
  );
}

interface YouTubeEmbedUnavailableProps {
  url: string;
}

export function YouTubeEmbedUnavailable({ url }: YouTubeEmbedUnavailableProps) {
  return (
    <section
      aria-label="YouTube video preview unavailable"
      className="rounded-2xl border border-border/60 bg-muted/20 p-4"
      data-testid="youtube-embed-unavailable"
    >
      <p className="text-sm text-muted-foreground">
        This YouTube link couldn&apos;t be embedded.{" "}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
        >
          Open video in a new tab
        </a>
      </p>
    </section>
  );
}

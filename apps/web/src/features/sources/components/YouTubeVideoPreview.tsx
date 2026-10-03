import { Card } from "@/shared/components/ui/card";
import { Empty, EmptyDescription } from "@/shared/components/ui/empty";
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
    <Card
      variant="flush"
      role="region"
      aria-label="YouTube video preview"
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
    </Card>
  );
}

interface YouTubeEmbedUnavailableProps {
  url: string;
}

export function YouTubeEmbedUnavailable({ url }: YouTubeEmbedUnavailableProps) {
  return (
    <Empty
      role="region"
      aria-label="YouTube video preview unavailable"
      data-testid="youtube-embed-unavailable"
    >
      <EmptyDescription>
        This YouTube link couldn&apos;t be embedded.{" "}
        <a href={url} target="_blank" rel="noopener noreferrer">
          Open video in a new tab
        </a>
      </EmptyDescription>
    </Empty>
  );
}

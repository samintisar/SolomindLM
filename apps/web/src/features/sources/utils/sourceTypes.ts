import type { Source } from "@/shared/types";

export type YouTubeSource = Source & { type: "YOUTUBE"; url: string };

export function isYouTubeSource(source: Source): source is YouTubeSource {
  return source.type === "YOUTUBE" && Boolean(source.url);
}

export function hasExternalSourceUrl(source: Source): source is Source & { url: string } {
  return (
    (source.type === "WEB" || source.type === "PAPER" || source.type === "YOUTUBE") &&
    Boolean(source.url)
  );
}

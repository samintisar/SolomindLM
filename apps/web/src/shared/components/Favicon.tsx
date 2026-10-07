import { Globe } from "lucide-react";
import React, { useMemo, useState } from "react";

function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Google's favicon service serves clean 16, 32 and 64px icons and resamples other sizes, so
 * request one at least twice the displayed size and let it scale down (sharp on 2x screens).
 */
function requestedIconSize(displaySize: number): number {
  return displaySize <= 16 ? 32 : 64;
}

interface FaviconProps {
  url: string | undefined;
  size?: number;
  className?: string;
  fallback?: React.ReactNode;
  /** `cover` fills the box (good for circular avatars); default `contain` preserves full icon with letterboxing */
  fit?: "contain" | "cover";
}

export const Favicon: React.FC<FaviconProps> = ({
  url,
  size = 16,
  className = "",
  fallback,
  fit = "contain",
}) => {
  const [error, setError] = useState(false);

  const hostname = useMemo(() => (url ? extractHostname(url) : null), [url]);
  const src = useMemo(() => {
    if (!hostname) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=${requestedIconSize(size)}`;
  }, [hostname, size]);

  if (!src || error) {
    return (
      <span className={`shrink-0 inline-block ${className}`}>
        {fallback ?? <Globe className="h-4 w-4 text-muted-foreground" />}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={hostname ? `${hostname} favicon` : "Site favicon"}
      width={size}
      height={size}
      loading="lazy"
      className={`inline-block size-(--favicon-size) max-h-(--favicon-size) max-w-(--favicon-size) shrink-0 ${fit === "cover" ? "object-cover" : "object-contain"} ${className}`}
      style={{ "--favicon-size": `${size}px` } as React.CSSProperties}
      onError={() => setError(true)}
    />
  );
};

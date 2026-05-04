import React, { useState, useMemo } from "react";
import { Globe } from "lucide-react";

function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
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
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=${size}`;
  }, [hostname, size]);

  if (!src || error) {
    return (
      <span className={`shrink-0 self-start inline-block ${className}`}>
        {fallback ?? <Globe className="h-4 w-4 text-muted-foreground" />}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      loading="lazy"
      className={`shrink-0 self-start inline-block ${fit === "cover" ? "object-cover" : "object-contain"} ${className}`}
      style={{ width: size, height: size, maxWidth: size, maxHeight: size }}
      onError={() => setError(true)}
    />
  );
};

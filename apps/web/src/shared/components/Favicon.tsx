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
}

export const Favicon: React.FC<FaviconProps> = ({
  url,
  size = 16,
  className = "",
  fallback,
}) => {
  const [error, setError] = useState(false);

  const hostname = useMemo(() => (url ? extractHostname(url) : null), [url]);
  const src = useMemo(() => {
    if (!hostname) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=${size}`;
  }, [hostname, size]);

  if (!src || error) {
    return (
      <span className={`shrink-0 inline-block ${className}`}>
        {fallback ?? <Globe className="w-4 h-4 text-muted-foreground" />}
      </span>
    );
  }

  return (
    <span
      className={`shrink-0 inline-block bg-contain bg-center bg-no-repeat -mt-[4px] ${className}`}
      style={{ width: size, height: size, backgroundImage: `url(${src})` }}
    />
  );
};

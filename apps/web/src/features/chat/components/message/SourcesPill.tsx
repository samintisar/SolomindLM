import { useMemo } from "react";
import { Favicon } from "@/shared/components/Favicon";
import { Button } from "@/shared/components/ui/button";
import type { ExternalSource } from "../ExternalSourcesModal";

const MAX_FAVICONS = 3;

/** Up to three source URLs with distinct hostnames, for the favicon stack. */
function previewUrls(sources: ExternalSource[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const s of sources) {
    let key: string;
    try {
      key = new URL(s.url).hostname;
    } catch {
      key = s.url;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(s.url);
    if (urls.length >= MAX_FAVICONS) break;
  }
  return urls;
}

interface SourcesPillProps {
  sources: ExternalSource[];
  onOpen?: (sources: ExternalSource[]) => void;
}

/** "N sources" button with a stack of favicons; opens the panel's external-sources dialog. */
export function SourcesPill({ sources, onOpen }: SourcesPillProps) {
  const urls = useMemo(() => previewUrls(sources), [sources]);
  const count = sources.length;
  const noun = count === 1 ? "source" : "sources";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`View ${count} ${noun}`}
      onClick={() => onOpen?.(sources)}
    >
      <span className="flex -space-x-2" aria-hidden>
        {urls.map((url) => (
          <span
            key={url}
            className="inline-flex size-4 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-background"
          >
            <Favicon url={url} size={16} fit="cover" className="size-full rounded-full" />
          </span>
        ))}
      </span>
      <span>
        {count} {noun}
      </span>
    </Button>
  );
}

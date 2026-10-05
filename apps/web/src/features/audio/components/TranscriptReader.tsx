import { ArrowDown, FileText } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty";
import { cn } from "@/shared/utils/cn";
import type { ReaderLine } from "../transcript/transcriptLines";

const SCROLL_KEYS = new Set(["PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End"]);

const SPEAKERS = {
  host_a: { label: "Host 1", className: "text-studio-audio" },
  host_b: { label: "Host 2", className: "text-primary" },
} as const;

interface TranscriptReaderProps {
  lines: ReaderLine[];
  /** Index of the line being spoken, or -1 when none is. */
  activeIndex: number;
  isPlaying: boolean;
  /** True when the timings are estimated rather than saved at generation. */
  approximate: boolean;
  onSeek: (ms: number) => void;
}

/**
 * The transcript, read like live lyrics: the line being spoken is full strength and centred, the
 * rest recede. It follows the audio until the reader scrolls away mid-playback, then offers a
 * button to rejoin. Clicking a line seeks the audio to it.
 */
export function TranscriptReader({
  lines,
  activeIndex,
  isPlaying,
  approximate,
  onSeek,
}: TranscriptReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const reduceMotion = useReducedMotion();

  const centreActiveLine = useEffectEvent((behavior: ScrollBehavior) => {
    const container = containerRef.current;
    if (!container || activeIndex < 0) return;
    const line = container.querySelector<HTMLElement>(`[data-line-index="${activeIndex}"]`);
    if (!line) return;
    container.scrollTo({
      top: line.offsetTop - container.clientHeight / 2 + line.offsetHeight / 2,
      behavior,
    });
  });

  // Not scrollIntoView: it also scrolls every ancestor, which would drag the whole page along.
  // The first centring (on open) jumps; later ones glide unless the user prefers reduced motion.
  const hasCentredRef = useRef(false);
  const followActiveLine = useEffectEvent(() => {
    if (!following || activeIndex < 0) return;
    const glide = hasCentredRef.current && !reduceMotion;
    hasCentredRef.current = true;
    centreActiveLine(glide ? "smooth" : "auto");
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the active line changes; the effect event reads everything else.
  useEffect(() => {
    followActiveLine();
  }, [activeIndex]);

  // Only the user's own input counts as leaving: programmatic scrolls fire `scroll` too.
  const handleManualScroll = () => {
    if (isPlaying) setFollowing(false);
  };

  const rejoin = () => {
    setFollowing(true);
    centreActiveLine(reduceMotion ? "auto" : "smooth");
  };

  const handleSeek = (line: ReaderLine) => {
    setFollowing(true);
    onSeek(line.startMs);
  };

  if (lines.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No transcript</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Siblings of the scroller, not children: the fade mask would dim them too. */}
      {approximate && (
        <div className="absolute top-2 right-4 z-10">
          <Badge variant="secondary" title="Timings are estimated for this older overview">
            Approximate sync
          </Badge>
        </div>
      )}

      <div
        ref={containerRef}
        role="presentation"
        className="relative min-h-0 flex-1 overflow-y-auto reader-fade px-6"
        onWheel={handleManualScroll}
        onTouchMove={handleManualScroll}
        onKeyDown={(event) => {
          if (SCROLL_KEYS.has(event.key)) handleManualScroll();
        }}
      >
        <div aria-hidden className="h-32" />
        {lines.map((line, index) => {
          const speaker = line.speaker ? SPEAKERS[line.speaker] : null;
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;
          return (
            <button
              key={index}
              type="button"
              data-line-index={index}
              aria-current={isActive ? "true" : undefined}
              onClick={() => handleSeek(line)}
              className={cn(
                "block w-full origin-left rounded-md py-2 text-left outline-hidden transition duration-500 ease-out focus-visible:ring-2 focus-visible:ring-ring hover:opacity-60 motion-reduce:scale-100",
                isActive && "scale-100 opacity-100 hover:opacity-100",
                !isActive && "scale-95",
                !isActive && (isPast ? "opacity-40" : "opacity-30")
              )}
            >
              {speaker && (
                <span
                  className={cn(
                    "block font-sans text-xs font-semibold tracking-wide uppercase",
                    speaker.className
                  )}
                >
                  {speaker.label}
                </span>
              )}
              <span className="block font-serif text-xl leading-snug font-semibold text-foreground md:text-2xl">
                {line.text}
              </span>
            </button>
          );
        })}
        <div aria-hidden className="h-48" />
      </div>

      {!following && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 animate-in duration-200 ease-out fade-in slide-in-from-bottom-2">
          <Button size="sm" variant="secondary" onClick={rejoin}>
            <ArrowDown />
            Follow along
          </Button>
        </div>
      )}
    </div>
  );
}

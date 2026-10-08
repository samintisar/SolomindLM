import { FileText, LocateFixed } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { memo, useEffect, useEffectEvent, useRef, useState } from "react";
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
  /** True while estimated timings are being matched to the audio; the badge says so. */
  syncing?: boolean;
  onSeek: (ms: number) => void;
}

/**
 * The transcript, read like live lyrics: the line being spoken is full strength and centred, the
 * rest recede. It follows the audio until the reader scrolls away mid-playback, then offers a
 * button to rejoin. Clicking a line seeks the audio to it.
 *
 * Memoized: the player re-renders on every `timeupdate`, but this only needs to when the active
 * line changes, so give it a stable `onSeek` and `lines`.
 */
export const TranscriptReader = memo(function TranscriptReader(props: TranscriptReaderProps) {
  // The memo wraps a plain component rather than the reader itself: in a function passed straight
  // to memo, React 19.2.0's useEffectEvent read stale props and state, so the reader went on
  // following the audio after the user had scrolled away.
  return <TranscriptReaderView {...props} />;
});

function TranscriptReaderView({
  lines,
  activeIndex,
  isPlaying,
  approximate,
  syncing = false,
  onSeek,
}: TranscriptReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const reduceMotion = useReducedMotion();

  // True while a scroll the reader started itself is in flight, so its `scroll` events are not
  // mistaken for the user leaving. Cleared by `scrollend`, or by a timer where that is missing.
  const programmaticRef = useRef(false);
  const settleRef = useRef<number | undefined>(undefined);
  // Where the reader last scrolled to. A background tab holds scroll events back until it is
  // shown again, after the timer has run out; landing exactly here still means it was ours.
  const lastTargetRef = useRef<number | null>(null);

  useEffect(() => () => window.clearTimeout(settleRef.current), []);

  const settleProgrammaticScroll = () => {
    programmaticRef.current = false;
    window.clearTimeout(settleRef.current);
  };

  // Not scrollIntoView: it also scrolls every ancestor, which would drag the whole page along.
  // Plain function reading only refs, so effects and handlers can both call it.
  const centreLine = (index: number, behavior: ScrollBehavior) => {
    const container = containerRef.current;
    const line = container?.querySelector<HTMLElement>(`[data-line-index="${index}"]`);
    if (!container || !line) return;
    const top = line.offsetTop - container.clientHeight / 2 + line.offsetHeight / 2;
    const target = Math.max(0, Math.min(container.scrollHeight - container.clientHeight, top));
    // No movement means no scroll or scrollend events, so there is nothing to wait for.
    if (Math.abs(container.scrollTop - target) < 1) return;
    lastTargetRef.current = target;
    programmaticRef.current = true;
    window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(
      () => {
        programmaticRef.current = false;
      },
      behavior === "smooth" ? 1000 : 150
    );
    container.scrollTo({ top: target, behavior });
  };

  // The first centring (on open) jumps; later ones glide unless the user prefers reduced motion.
  const hasCentredRef = useRef(false);
  const followActiveLine = useEffectEvent(() => {
    if (!following || activeIndex < 0) return;
    // No glide in a hidden tab: nothing renders there, so it would only replay on return.
    const glide = hasCentredRef.current && !reduceMotion && !document.hidden;
    hasCentredRef.current = true;
    centreLine(activeIndex, glide ? "smooth" : "auto");
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the active line changes; the effect event reads everything else.
  useEffect(() => {
    followActiveLine();
  }, [activeIndex]);

  const handleManualScroll = () => {
    if (isPlaying) setFollowing(false);
  };

  const focusLine = (index: number, options?: FocusOptions) => {
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-line-index="${index}"]`)
      ?.focus(options);
  };

  const rejoin = () => {
    setFollowing(true);
    centreLine(activeIndex, reduceMotion ? "auto" : "smooth");
    // The button unmounts, so a keyboard user would otherwise lose their place.
    focusLine(activeIndex, { preventScroll: true });
  };

  const handleSeek = (index: number, line: ReaderLine) => {
    setFollowing(true);
    // The line may already be the active one, so no line change would re-centre it.
    centreLine(index, reduceMotion ? "auto" : "smooth");
    onSeek(line.startMs);
  };

  // One tab stop for the whole transcript: the line being spoken, else the last one focused.
  const lastIndex = lines.length - 1;
  const tabStop = Math.min(
    lastIndex,
    activeIndex >= 0 ? activeIndex : focusedIndex >= 0 ? focusedIndex : 0
  );

  const handleLineKeyDown = (event: React.KeyboardEvent, index: number) => {
    const next =
      event.key === "ArrowDown"
        ? Math.min(lastIndex, index + 1)
        : event.key === "ArrowUp"
          ? Math.max(0, index - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : null;
    if (next === null) return;
    event.preventDefault();
    focusLine(next);
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
    <section aria-label="Transcript" className="relative flex min-h-0 flex-1 flex-col">
      {/* Siblings of the scroller, not children: the fade mask would dim them too. */}
      {approximate && (
        <div className="absolute top-2 right-4 z-10">
          {syncing ? (
            <Badge variant="secondary" title="Matching the transcript to the audio">
              Syncing…
            </Badge>
          ) : (
            <Badge variant="secondary" title="Timings are estimated for this older overview">
              Approximate sync
            </Badge>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        role="presentation"
        className="relative min-h-0 flex-1 overflow-y-auto reader-fade px-6"
        onScroll={(event) => {
          if (programmaticRef.current) return;
          const last = lastTargetRef.current;
          if (last !== null && Math.abs(event.currentTarget.scrollTop - last) < 2) return;
          handleManualScroll();
        }}
        onScrollEnd={settleProgrammaticScroll}
        onPointerDown={(event) => {
          // Grabbing the scrollbar mid-glide is the user taking over.
          if (
            event.target === event.currentTarget &&
            event.nativeEvent.offsetX >= event.currentTarget.clientWidth
          ) {
            settleProgrammaticScroll();
          }
        }}
        // Wheel, touch and keys also catch input that interrupts a glide still in flight.
        onWheel={handleManualScroll}
        onTouchMove={handleManualScroll}
        onKeyDown={(event) => {
          if (SCROLL_KEYS.has(event.key)) handleManualScroll();
        }}
      >
        <div aria-hidden className="h-1/2 min-h-32" />
        {lines.map((line, index) => {
          const speaker = line.speaker ? SPEAKERS[line.speaker] : null;
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;
          return (
            <button
              key={index}
              type="button"
              data-line-index={index}
              tabIndex={index === tabStop ? 0 : -1}
              aria-current={isActive ? "true" : undefined}
              onClick={() => handleSeek(index, line)}
              onFocus={() => setFocusedIndex(index)}
              onKeyDown={(event) => handleLineKeyDown(event, index)}
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
        <div aria-hidden className="h-1/2 min-h-48" />
      </div>

      {!following && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 animate-in duration-200 ease-out fade-in slide-in-from-bottom-2">
          <Button size="sm" variant="secondary" onClick={rejoin}>
            <LocateFixed />
            Follow along
          </Button>
        </div>
      )}
    </section>
  );
}

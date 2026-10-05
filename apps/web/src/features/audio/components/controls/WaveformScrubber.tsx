import { useRef } from "react";
import { cn } from "@/shared/utils/cn";
import { formatAudioTime } from "../../hooks/useAudioPlayer";

const SKIP_SECONDS = 10;

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 1000;
}

function barHeights(seed: string, bars: number): number[] {
  const h = hashSeed(seed);
  return Array.from({ length: bars }, (_, i) => {
    const raw = 20 + Math.abs(Math.sin(i * 1.7 + h) * 50 + Math.sin(i * 0.37 + h) * 30);
    return Math.round(Math.min(100, Math.max(12, raw)));
  });
}

interface WaveformScrubberProps {
  /** Any stable string (the note id): the same seed always draws the same bars. */
  seed: string;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  disabled?: boolean;
  bars?: number;
}

/**
 * Seek bar drawn as a waveform. The bars are decorative: they come from the seed, with no audio
 * analysis, and only the played / unplayed split carries information. Click or drag to seek;
 * arrow keys skip 10 seconds, Home and End jump to the ends.
 */
export function WaveformScrubber({
  seed,
  currentTime,
  duration,
  onSeek,
  disabled = false,
  bars = 64,
}: WaveformScrubberProps) {
  const draggingRef = useRef(false);
  const heights = barHeights(seed, bars);
  const canSeek = !disabled && Number.isFinite(duration) && duration > 0;
  const progress = canSeek ? currentTime / duration : 0;

  const seekToPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canSeek || event.button !== 0) return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekToPointer(event);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    seekToPointer(event);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  // The browser took the pointer away (capture released or lost): stop following it.
  const handleCaptureLost = () => {
    draggingRef.current = false;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canSeek) return;

    let target: number;
    switch (event.key) {
      case "ArrowLeft":
        target = currentTime - SKIP_SECONDS;
        break;
      case "ArrowRight":
        target = currentTime + SKIP_SECONDS;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = duration;
        break;
      default:
        return;
    }
    // The player also skips on arrow keys at the document level; keep it from skipping twice.
    event.preventDefault();
    event.stopPropagation();
    onSeek(Math.min(duration, Math.max(0, target)));
  };

  return (
    <div className="w-full">
      <div
        role="slider"
        tabIndex={canSeek ? 0 : -1}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatAudioTime(currentTime)} of ${formatAudioTime(duration)}`}
        aria-disabled={!canSeek}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handleCaptureLost}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex h-9 touch-none items-center gap-0.5 rounded-md outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
          canSeek ? "cursor-pointer" : "cursor-default opacity-60"
        )}
      >
        {heights.map((height, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "audio-bar flex-1 rounded-xs",
              i / bars < progress ? "bg-primary" : "bg-foreground/15"
            )}
            style={{ "--audio-bar": `${height}%` } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="flex justify-between font-sans text-xs tabular-nums text-muted-foreground">
        <span>{formatAudioTime(currentTime)}</span>
        <span>{formatAudioTime(duration)}</span>
      </div>
    </div>
  );
}

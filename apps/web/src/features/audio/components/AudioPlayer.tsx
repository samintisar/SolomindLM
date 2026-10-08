import { ArrowLeft, Download } from "lucide-react";
import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/spinner";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { usePauseAlignedLines } from "../hooks/usePauseAlignedLines";
import { useResolvedAudioPlaybackUrl } from "../hooks/useResolvedAudioPlaybackUrl";
import { currentLineIndex, resolveReaderLines } from "../transcript/transcriptLines";
import { PlayButton } from "./controls/PlayButton";
import { SkipButton } from "./controls/SkipButton";
import { SpeedPill } from "./controls/SpeedPill";
import { WaveformScrubber } from "./controls/WaveformScrubber";
import { TranscriptReader } from "./TranscriptReader";

const SKIP_SECONDS = 10;
/** Older overviews longer than this keep estimated timings rather than decode the whole file. */
const MAX_ALIGN_SECONDS = 40 * 60;

/** Keys typed here belong to the field or dialog, not the player. */
const IGNORED_TARGETS =
  "input, textarea, select, [contenteditable='true'], [role='dialog'], [role='alertdialog'], [aria-modal='true']";
/** Space presses these, so the player must not also toggle playback. */
const PRESSABLE_TARGETS =
  "button, a, summary, [role='button'], [role='slider'], [role='tab'], [role='menuitem'], [role='checkbox'], [role='switch'], [role='option']";

const AUDIO_TYPE_LABELS: Record<string, string> = {
  deep_dive: "Deep dive",
  brief: "Brief",
  critique: "Critique",
  debate: "Debate",
};

function audioTypeLabel(metadata: Record<string, unknown> | undefined): string {
  const audioType = metadata?.audioType;
  return (typeof audioType === "string" && AUDIO_TYPE_LABELS[audioType]) || "Audio overview";
}

interface AudioPlayerProps {
  audioUrl: string;
  audioOverviewId?: string;
  transcript?: string;
  title?: string;
  /** The saved `audioOverviews.metadata`: `lines` carries the per-line timings. */
  metadata?: Record<string, unknown>;
  onBack?: () => void;
}

/**
 * The "Reader": the transcript reads like live lyrics and follows the audio, above a floating
 * three-row card (title and speed, waveform scrubber, transport).
 *
 * Space or k toggles play and the arrow keys skip 10 seconds, but only while this player is on
 * screen: the notebook keeps a second, CSS-hidden Studio panel for the other breakpoint.
 */
export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  audioOverviewId,
  transcript,
  title,
  metadata,
  onBack,
}) => {
  const resolvedPlayback = useResolvedAudioPlaybackUrl(audioUrl, audioOverviewId);
  const audioSource = typeof resolvedPlayback === "string" ? resolvedPlayback : null;
  const {
    audioRef,
    canSeek,
    currentTime,
    cyclePlaybackRate,
    duration,
    error,
    isPlaying,
    playbackRate,
    seekTo,
    skipBy,
    togglePlay,
  } = useAudioPlayer(audioSource);
  const isResolving = resolvedPlayback === undefined;
  const isUnavailable = resolvedPlayback === null;
  const canPlay = !!audioSource && !error;

  // The estimate depends on the duration, which is 0 until the audio loads. currentLineIndex is
  // -1 until then, so the reader does not open on the last line.
  const estimated = useMemo(
    () => resolveReaderLines(metadata, transcript ?? "", duration),
    [metadata, transcript, duration]
  );
  // Older overviews saved no timings: time their lines to the pauses in the audio instead. That
  // downloads and decodes the whole file, so wait until it is played (opening one to read or
  // download must not cost the full file on mobile data), and skip long files, whose decode
  // would hold hundreds of MB and freeze playback.
  const [playedSource, setPlayedSource] = useState<string | null>(null);
  if (isPlaying && audioSource && playedSource !== audioSource) setPlayedSource(audioSource);
  const hasPlayed = audioSource !== null && playedSource === audioSource;
  const tooLongToAlign = duration > MAX_ALIGN_SECONDS;
  const needsAlignment = estimated.approximate && estimated.lines.length > 1;
  const alignment = usePauseAlignedLines(
    audioSource,
    transcript ?? "",
    needsAlignment && hasPlayed && duration > 0 && !tooLongToAlign
  );
  const alignedLines =
    needsAlignment && alignment.lines?.length === estimated.lines.length ? alignment.lines : null;
  const resolved = useMemo(
    () => (alignedLines ? { lines: alignedLines, approximate: false, timed: true } : estimated),
    [alignedLines, estimated]
  );
  // Before play the estimate may still be replaced, so it carries no badge; "Syncing…" while it
  // is matched to the audio; "Approximate sync" once the estimate is here to stay.
  const syncBadge: "syncing" | "approximate" | null = !resolved.approximate
    ? null
    : !needsAlignment || tooLongToAlign || isUnavailable || error || alignment.status === "failed"
      ? "approximate"
      : alignment.status === "aligning"
        ? "syncing"
        : null;
  // The reader gets only the index, so a `timeupdate` within the same line does not re-render it.
  const activeIndex = currentLineIndex(resolved, currentTime * 1000);
  const seekToLine = useCallback(
    (ms: number) => {
      // Before the audio loads a seek would move the highlight with no audio behind it.
      if (canSeek) seekTo(ms / 1000);
    },
    [canSeek, seekTo]
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;

    const root = rootRef.current;
    if (!root || root.checkVisibility?.() === false) return;

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(IGNORED_TARGETS)) return;
    if (target instanceof HTMLElement && target.isContentEditable) return;

    if (event.key === " " || event.key.toLowerCase() === "k") {
      // A focused button or link presses itself on Space; k is not pressed by anything.
      if (event.key === " " && target?.closest(PRESSABLE_TARGETS)) return;
      if (!canPlay) return;
      event.preventDefault();
      void togglePlay();
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      // The scrubber skips on arrows itself.
      if (target?.closest("[role='slider']")) return;
      // Arrows also scroll sideways in code blocks and tables elsewhere on the page.
      if (target !== document.body && !(target && root.contains(target))) return;
      if (!canSeek) return;
      event.preventDefault();
      skipBy(event.key === "ArrowLeft" ? -SKIP_SECONDS : SKIP_SECONDS);
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <div ref={rootRef} className="relative flex h-full flex-col">
      {/* Mobile Back Button */}
      {onBack && (
        <div className="z-20 flex shrink-0 items-center gap-2 px-4 py-3 md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to Studio">
            <ArrowLeft />
          </Button>
          <span className="truncate text-sm font-semibold text-foreground">
            {title || "Audio Overview"}
          </span>
        </div>
      )}

      <TranscriptReader
        lines={resolved.lines}
        activeIndex={activeIndex}
        isPlaying={isPlaying}
        approximate={syncBadge !== null}
        syncing={syncBadge === "syncing"}
        onSeek={seekToLine}
      />

      {(isResolving || isUnavailable || error) && (
        <div className="shrink-0 px-6 py-2 text-center">
          {isResolving && (
            <div role="status" className="flex items-center justify-center gap-2">
              <span className="inline-flex text-primary">
                <Spinner className="size-4" aria-hidden />
              </span>
              <p className="text-sm text-muted-foreground">Loading audio...</p>
            </div>
          )}
          {isUnavailable && (
            <p className="text-sm text-destructive">
              Could not resolve audio URL. Try regenerating the audio overview.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {/* Hidden audio element */}
      <audio ref={audioRef} src={audioSource ?? undefined} preload="metadata" />

      <div className="mx-3 mb-3 shrink-0 space-y-2 rounded-2xl bg-card p-3 shadow-lg ring-1 ring-hairline">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-sm font-semibold text-foreground">
              {title || "Audio Overview"}
            </h3>
            <p className="text-xs text-muted-foreground">{audioTypeLabel(metadata)} · 2 hosts</p>
          </div>
          <SpeedPill rate={playbackRate} onCycle={cyclePlaybackRate} disabled={!canPlay} />
          {audioSource ? (
            <Button variant="ghost" size="icon-sm" asChild>
              <a href={audioSource} download aria-label="Download audio" title="Download audio">
                <Download />
              </a>
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" disabled aria-label="Download audio">
              <Download />
            </Button>
          )}
        </div>

        <WaveformScrubber
          seed={audioOverviewId ?? audioUrl}
          currentTime={currentTime}
          duration={duration}
          onSeek={seekTo}
          disabled={!canSeek}
        />

        <div className="flex items-center justify-center gap-4">
          <SkipButton
            direction="back"
            onSkip={() => skipBy(-SKIP_SECONDS)}
            disabled={!canSeek}
            keyShortcuts="ArrowLeft"
          />
          <PlayButton
            isPlaying={isPlaying}
            onToggle={togglePlay}
            disabled={!canPlay || isResolving}
            keyShortcuts="Space k"
          />
          <SkipButton
            direction="forward"
            onSkip={() => skipBy(SKIP_SECONDS)}
            disabled={!canSeek}
            keyShortcuts="ArrowRight"
          />
        </div>
      </div>
    </div>
  );
};

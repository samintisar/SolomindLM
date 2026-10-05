import { ChevronUp, Download, X } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/spinner";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useResolvedAudioPlaybackUrl } from "../hooks/useResolvedAudioPlaybackUrl";
import { PlayButton } from "./controls/PlayButton";
import { SkipButton } from "./controls/SkipButton";
import { SpeedPill } from "./controls/SpeedPill";
import { WaveformScrubber } from "./controls/WaveformScrubber";

const SKIP_SECONDS = 10;

interface MiniAudioPlayerProps {
  audioUrl: string;
  /** When set, `audioUrl` is resolved on the server via `storage.getUrl` (handles legacy `/audio/...`). */
  audioOverviewId?: string;
  title?: string;
  transcript?: string;
  isVisible: boolean;
  onClose: () => void;
  onExpand: () => void;
}

export const MiniAudioPlayer: React.FC<MiniAudioPlayerProps> = ({
  audioUrl,
  audioOverviewId,
  title = "Audio Overview",
  transcript: _transcript,
  isVisible,
  onClose,
  onExpand,
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
    play,
    playbackRate,
    seekTo,
    skipBy,
    togglePlay,
  } = useAudioPlayer(audioSource);
  const isResolving = resolvedPlayback === undefined;
  const isUnavailable = resolvedPlayback === null;
  const canPlay = !!audioSource && !error;

  /** Autoplay once per visible session / source — must not depend on `isPlaying` or pause immediately resumes. */
  const lastAutoplaySourceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isVisible) {
      lastAutoplaySourceRef.current = null;
      return;
    }
    if (!audioSource) return;
    if (lastAutoplaySourceRef.current === audioSource) return;
    lastAutoplaySourceRef.current = audioSource;
    void play();
  }, [audioSource, isVisible, play]);

  if (!isVisible) return null;

  return (
    <div className="w-full bg-card shadow-lg ring-1 ring-hairline animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Loading state */}
      {isResolving && (
        <div className="flex items-center justify-center py-4">
          <div role="status" className="text-center">
            <span className="mb-1 inline-flex text-primary">
              <Spinner className="size-6" aria-hidden />
            </span>
            <p className="text-xs text-muted-foreground">Loading audio...</p>
          </div>
        </div>
      )}

      {isUnavailable && (
        <div className="px-4 py-2 text-center text-xs text-destructive">
          Could not resolve audio URL. Try regenerating the audio overview or check your connection.
        </div>
      )}

      {error && <div className="px-4 py-2 text-center text-xs text-destructive">{error}</div>}

      {/* Hidden audio element */}
      <audio ref={audioRef} src={audioSource ?? undefined} preload="metadata" />

      <div className="w-full space-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-foreground">
            {title}
          </h3>
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onExpand}
            aria-label="Expand player"
            title="Expand player"
          >
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close player"
            title="Close player"
          >
            <X />
          </Button>
        </div>

        <WaveformScrubber
          seed={audioOverviewId ?? audioUrl}
          currentTime={currentTime}
          duration={duration}
          onSeek={seekTo}
          disabled={!canSeek}
          bars={48}
        />

        <div className="flex items-center justify-center gap-3">
          <SkipButton
            direction="back"
            size="sm"
            onSkip={() => skipBy(-SKIP_SECONDS)}
            disabled={!canSeek}
          />
          <PlayButton
            size="sm"
            isPlaying={isPlaying}
            onToggle={togglePlay}
            disabled={!canPlay || isResolving}
          />
          <SkipButton
            direction="forward"
            size="sm"
            onSkip={() => skipBy(SKIP_SECONDS)}
            disabled={!canSeek}
          />
        </div>
      </div>
    </div>
  );
};

import { ChevronUp, Download, Pause, Play, RotateCcw, RotateCw, X } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { formatAudioTime, useAudioPlayer } from "../hooks/useAudioPlayer";
import { useResolvedAudioPlaybackUrl } from "../hooks/useResolvedAudioPlaybackUrl";

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
    <div className="w-full bg-card border-t border-border shadow-lg animate-in slide-in-from-bottom duration-300">
      {/* Loading state */}
      {isResolving && (
        <div className="flex items-center justify-center py-4">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary mb-1"></div>
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

      <div className="w-full px-4 py-3">
        {/* Top Section: Title and Controls */}
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-foreground truncate">{title}</h3>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Download Button */}
            <a
              href={audioSource ?? "#"}
              download
              className={`p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground ${
                audioSource ? "" : "pointer-events-none opacity-50"
              }`}
              title="Download audio"
            >
              <Download className="w-4 h-4" />
            </a>

            {/* Expand Button */}
            <button
              onClick={onExpand}
              className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              title="Expand player"
            >
              <ChevronUp className="w-4 h-4" />
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              title="Close player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2 mb-3">
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={currentTime}
            disabled={!canSeek}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            style={{ accentColor: "hsl(var(--primary))" }}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatAudioTime(currentTime)}</span>
            <span>{formatAudioTime(duration)}</span>
          </div>
        </div>

        {/* Player Controls */}
        <div className="flex items-center gap-3">
          {/* Skip Backward Button */}
          <button
            onClick={() => skipBy(-5)}
            disabled={!canSeek}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Backward 5 seconds"
            title="Backward 5s"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            disabled={!canPlay || isResolving}
            className="p-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          {/* Skip Forward Button */}
          <button
            onClick={() => skipBy(5)}
            disabled={!canSeek}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Forward 5 seconds"
            title="Forward 5s"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Playback Rate Button */}
          <button
            onClick={cyclePlaybackRate}
            disabled={!canPlay}
            className="px-2.5 py-1 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors text-muted-foreground hover:text-foreground shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            title="Change playback speed"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
};

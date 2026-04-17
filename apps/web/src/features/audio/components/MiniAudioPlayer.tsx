import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, ChevronUp, X, RotateCcw, RotateCw } from 'lucide-react';
import { useResolvedAudioPlaybackUrl } from '../hooks/useResolvedAudioPlaybackUrl';

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
  title = 'Audio Overview',
  transcript: _transcript,
  isVisible,
  onClose,
  onExpand,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  const resolvedPlayback = useResolvedAudioPlaybackUrl(audioUrl, audioOverviewId);

  // Fetch audio as blob to enable seeking without server Range Request support
  useEffect(() => {
    if (!isVisible) return; // Only fetch when visible

    if (resolvedPlayback === undefined) return;

    if (resolvedPlayback === null) {
      setBlobUrl(null);
      setIsLoading(false);
      return;
    }

    let mounted = true;
    let localBlobUrl: string | null = null;

    const fetchAudio = async () => {
      try {
        console.log('[MiniAudioPlayer] Fetching audio as blob for seeking support...');
        setIsLoading(true);
        setBlobUrl(null);

        const response = await fetch(resolvedPlayback);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        console.log('[MiniAudioPlayer] Audio blob size:', blob.size, 'bytes');

        localBlobUrl = URL.createObjectURL(blob);

        if (mounted) {
          setBlobUrl(localBlobUrl);
          setIsLoading(false);
          console.log('[MiniAudioPlayer] Blob URL created:', localBlobUrl);
        }
      } catch (error) {
        console.error('[MiniAudioPlayer] Failed to fetch audio as blob:', error);
        if (mounted) {
          setIsLoading(false);
          // Fall back to streaming from HTTPS URL if blob fetch fails
          setBlobUrl(resolvedPlayback);
        }
      }
    };

    fetchAudio();

    return () => {
      mounted = false;
      if (localBlobUrl) {
        console.log('[MiniAudioPlayer] Revoking blob URL');
        URL.revokeObjectURL(localBlobUrl);
      }
    };
  }, [resolvedPlayback, isVisible]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setProgress((audio.currentTime / audio.duration) * 100 || 0);
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      console.log('[MiniAudioPlayer loadedmetadata]', {
        audioDuration: audio.duration,
        readyState: audio.readyState,
        networkState: audio.networkState,
      });
      audio.playbackRate = 1;
      audio.defaultPlaybackRate = 1;
      setDuration(audio.duration);
      // Auto-play when the player is visible and metadata is loaded
      if (isVisible) {
        audio.play().catch(err => console.error('Autoplay failed:', err));
      }
    };

    const handleDurationChange = () => {
      console.log('[MiniAudioPlayer durationchange]', {
        newDuration: audio.duration,
      });
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    const handleAudioError = () => {
      console.error('[MiniAudioPlayer] Audio failed to load:', {
        src: audio.src,
        error: 'No supported sources',
        audioUrl,
        resolvedPlayback,
      });
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleAudioError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleAudioError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el || isLoading) return;
    if (resolvedPlayback === undefined || resolvedPlayback === null) return;
    try {
      if (isPlaying) {
        el.pause();
      } else {
        await el.play();
      }
    } catch (e) {
      console.error('[MiniAudioPlayer] play() failed:', e);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const actualDuration = audioRef.current.duration;
      if (!isFinite(actualDuration)) {
        console.log('[MiniAudioPlayer handleSeek] blocked - invalid duration', {
          actualDuration,
          durationState: duration,
        });
        return;
      }
      const displayedTime = (parseFloat(e.target.value) / 100) * actualDuration;
      console.log('[MiniAudioPlayer handleSeek]', {
        sliderValue: e.target.value,
        durationState: duration,
        audioDuration: actualDuration,
        currentTimeBefore: audioRef.current.currentTime,
        calculatedTime: displayedTime,
      });
      audioRef.current.currentTime = displayedTime;
      console.log('[MiniAudioPlayer handleSeek] after set:', {
        currentTimeAfter: audioRef.current.currentTime,
      });
      setProgress(parseFloat(e.target.value));
    }
  };

  const changePlaybackRate = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    const newRate = rates[nextIndex];
    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };

  const skip = (seconds: number) => {
    if (audioRef.current) {
      const actualDuration = audioRef.current.duration;

      // Check if audio is ready
      if (!isFinite(actualDuration) || actualDuration === 0) {
        console.warn('[MiniAudioPlayer skip] Cannot skip - audio not ready:', {
          audioDuration: actualDuration,
          readyState: audioRef.current.readyState,
          networkState: audioRef.current.networkState,
          src: audioRef.current.src,
        });
        return;
      }

      const beforeTime = audioRef.current.currentTime;
      const newTime = Math.max(0, Math.min(actualDuration, audioRef.current.currentTime + seconds));
      console.log('[MiniAudioPlayer skip]', {
        seconds,
        audioDuration: actualDuration,
        currentTimeBefore: beforeTime,
        calculatedNewTime: newTime,
      });
      audioRef.current.currentTime = newTime;
      console.log('[MiniAudioPlayer skip] after set:', {
        currentTimeAfter: audioRef.current.currentTime,
      });
    }
  };

  if (!isVisible) return null;

  return (
    <div className="w-full bg-card border-t border-border shadow-lg animate-in slide-in-from-bottom duration-300">
      {/* Loading state */}
      {(isLoading || resolvedPlayback === undefined) && (
        <div className="flex items-center justify-center py-4">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary mb-1"></div>
            <p className="text-xs text-muted-foreground">Loading audio...</p>
          </div>
        </div>
      )}

      {resolvedPlayback === null && !isLoading && (
        <div className="px-4 py-2 text-center text-xs text-destructive">
          Could not resolve audio URL. Try regenerating the audio overview or check your connection.
        </div>
      )}

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={
          blobUrl ||
          (typeof resolvedPlayback === 'string' ? resolvedPlayback : undefined) ||
          undefined
        }
      />

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
              href={typeof resolvedPlayback === 'string' ? resolvedPlayback : '#'}
              download
              className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
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
            max="100"
            value={progress}
            onChange={handleSeek}
            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            style={{ accentColor: 'hsl(var(--primary))' }}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Player Controls */}
        <div className="flex items-center gap-3">
          {/* Skip Backward Button */}
          <button
            onClick={() => skip(-5)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors shrink-0"
            aria-label="Backward 5 seconds"
            title="Backward 5s"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            className="p-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors shrink-0"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>

          {/* Skip Forward Button */}
          <button
            onClick={() => skip(5)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors shrink-0"
            aria-label="Forward 5 seconds"
            title="Forward 5s"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Playback Rate Button */}
          <button
            onClick={changePlaybackRate}
            className="px-2.5 py-1 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors text-muted-foreground hover:text-foreground shrink-0"
            title="Change playback speed"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
};

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

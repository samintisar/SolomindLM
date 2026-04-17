import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, RotateCcw, RotateCw, ArrowLeft } from 'lucide-react';
import { useResolvedAudioPlaybackUrl } from '../hooks/useResolvedAudioPlaybackUrl';

interface AudioPlayerProps {
  audioUrl: string;
  audioOverviewId?: string;
  transcript?: string;
  title?: string;
  onBack?: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  audioOverviewId,
  transcript,
  title,
  onBack,
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
        console.log('[AudioPlayer] Fetching audio as blob for seeking support...');
        setIsLoading(true);
        setBlobUrl(null);

        const response = await fetch(resolvedPlayback);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        console.log('[AudioPlayer] Audio blob size:', blob.size, 'bytes');

        localBlobUrl = URL.createObjectURL(blob);

        if (mounted) {
          setBlobUrl(localBlobUrl);
          setIsLoading(false);
          console.log('[AudioPlayer] Blob URL created:', localBlobUrl);
        }
      } catch (error) {
        console.error('[AudioPlayer] Failed to fetch audio as blob:', error);
        if (mounted) {
          setIsLoading(false);
          setBlobUrl(resolvedPlayback);
        }
      }
    };

    fetchAudio();

    return () => {
      mounted = false;
      if (localBlobUrl) {
        console.log('[AudioPlayer] Revoking blob URL');
        URL.revokeObjectURL(localBlobUrl);
      }
    };
  }, [resolvedPlayback]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setProgress((audio.currentTime / audio.duration) * 100 || 0);
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      console.log('[AudioPlayer loadedmetadata]', {
        audioDuration: audio.duration,
        readyState: audio.readyState,
        networkState: audio.networkState,
      });
      audio.playbackRate = 1;
      audio.defaultPlaybackRate = 1;
      setDuration(audio.duration);
    };

    const handleDurationChange = () => {
      console.log('[AudioPlayer durationchange]', {
        newDuration: audio.duration,
        oldDurationState: duration,
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

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      console.error('[AudioPlayer] play() failed:', e);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const actualDuration = audioRef.current.duration;
      if (!isFinite(actualDuration)) {
        console.log('[AudioPlayer handleSeek] blocked - invalid duration', {
          actualDuration,
          durationState: duration,
        });
        return;
      }
      const displayedTime = (parseFloat(e.target.value) / 100) * actualDuration;
      console.log('[AudioPlayer handleSeek]', {
        sliderValue: e.target.value,
        durationState: duration,
        audioDuration: actualDuration,
        currentTimeBefore: audioRef.current.currentTime,
        calculatedTime: displayedTime,
      });
      audioRef.current.currentTime = displayedTime;
      console.log('[AudioPlayer handleSeek] after set:', {
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
      const beforeTime = audioRef.current.currentTime;
      const newTime = Math.max(0, Math.min(actualDuration, audioRef.current.currentTime + seconds));
      console.log('[AudioPlayer skip]', {
        seconds,
        audioDuration: actualDuration,
        currentTimeBefore: beforeTime,
        calculatedNewTime: newTime,
      });
      audioRef.current.currentTime = newTime;
      console.log('[AudioPlayer skip] after set:', {
        currentTimeAfter: audioRef.current.currentTime,
      });
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Mobile Back Button */}
      {onBack && (
        <div className="md:hidden flex items-center gap-2 p-4 border-b border-border bg-background/80 backdrop-blur-sm z-20 mb-4">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground flex items-center justify-center shrink-0"
            aria-label="Back to Studio"
          >
            <ArrowLeft className="w-5 h-5 shrink-0" />
          </button>
          <span className="text-sm font-semibold text-foreground truncate">{title || 'Audio Overview'}</span>
        </div>
      )}
      <div className="flex-1 flex flex-col bg-card border border-border rounded-xl p-4 space-y-4">
        {/* Loading state */}
        {(isLoading || resolvedPlayback === undefined) && (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
              <p className="text-sm text-muted-foreground">Loading audio...</p>
            </div>
          </div>
        )}

        {resolvedPlayback === null && !isLoading && (
          <p className="text-sm text-destructive text-center py-4">
            Could not resolve audio URL. Try regenerating the audio overview.
          </p>
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

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h3 className="font-bold text-foreground">{title || 'Audio Overview'}</h3>
        <div className="flex gap-2">
          <a
            href={typeof resolvedPlayback === 'string' ? resolvedPlayback : '#'}
            download
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
            title="Download audio"
          >
            <Download className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-2 shrink-0">
        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={handleSeek}
          className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
          style={{ accentColor: 'hsl(var(--primary))' }}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 shrink-0">
        <button
          onClick={() => skip(-5)}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors"
          aria-label="Backward 5 seconds"
          title="Backward 5s"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
        <button
          onClick={togglePlay}
          className="p-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
        </button>
        <button
          onClick={() => skip(5)}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors"
          aria-label="Forward 5 seconds"
          title="Forward 5s"
        >
          <RotateCw className="w-5 h-5" />
        </button>
        <button
          onClick={changePlaybackRate}
          className="px-3 py-1 text-sm font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
          title="Change playback speed"
        >
          {playbackRate}x
        </button>
      </div>

      {/* Transcript - Always shown and takes up remaining space */}
      {transcript && (
        <div className="flex-1 overflow-hidden flex flex-col border-t border-border pt-4 min-h-0">
          <h4 className="font-semibold text-sm mb-2 shrink-0">Transcript</h4>
          <div className="flex-1 overflow-y-auto text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {transcript}
          </div>
        </div>
      )}
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

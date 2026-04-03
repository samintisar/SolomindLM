import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, RotateCcw, RotateCw, ArrowLeft } from 'lucide-react';

interface AudioPlayerProps {
  audioUrl: string;
  transcript?: string;
  title?: string;
  onBack?: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, transcript, title, onBack }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setProgress((audio.currentTime / audio.duration) * 100 || 0);
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      audio.playbackRate = 1;
      audio.defaultPlaybackRate = 1;
      setDuration(audio.duration);
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
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, []);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current && duration) {
      const displayedTime = (parseFloat(e.target.value) / 100) * duration;
      audioRef.current.currentTime = displayedTime;
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
      audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.duration, audioRef.current.currentTime + seconds));
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
        {/* Hidden audio element */}
        <audio ref={audioRef} src={audioUrl} />

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h3 className="font-bold text-foreground">{title || 'Audio Overview'}</h3>
        <div className="flex gap-2">
          <a
            href={audioUrl}
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

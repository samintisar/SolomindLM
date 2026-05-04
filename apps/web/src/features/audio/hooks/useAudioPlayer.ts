import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clampTime(value: number, duration: number): number {
  if (!isFinitePositive(duration)) return Math.max(0, value);
  return Math.min(duration, Math.max(0, value));
}

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function useAudioPlayer(sourceUrl: string | null | undefined) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setIsPlaying(false);
    setIsReady(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
    if (sourceUrl) {
      audio.load();
    }
  }, [sourceUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncDuration = () => {
      setDuration(isFinitePositive(audio.duration) ? audio.duration : 0);
    };

    const syncTime = () => {
      setCurrentTime(audio.currentTime);
      syncDuration();
    };

    const handleReady = () => {
      setIsReady(true);
      syncDuration();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      syncTime();
    };

    const handleError = () => {
      setIsPlaying(false);
      setError("Audio failed to load");
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", handleReady);
    audio.addEventListener("canplay", handleReady);
    audio.addEventListener("durationchange", syncDuration);
    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("seeking", syncTime);
    audio.addEventListener("seeked", syncTime);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("loadedmetadata", handleReady);
      audio.removeEventListener("canplay", handleReady);
      audio.removeEventListener("durationchange", syncDuration);
      audio.removeEventListener("timeupdate", syncTime);
      audio.removeEventListener("seeking", syncTime);
      audio.removeEventListener("seeked", syncTime);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const nextTime = clampTime(seconds, audio.duration);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const seekToPercent = useCallback(
    (percent: number) => {
      if (!isFinitePositive(duration)) return;
      seekTo((Math.min(100, Math.max(0, percent)) / 100) * duration);
    },
    [duration, seekTo]
  );

  const skipBy = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      seekTo(audio.currentTime + seconds);
    },
    [seekTo]
  );

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !sourceUrl) return;

    try {
      if (isFinitePositive(audio.duration) && audio.currentTime >= audio.duration) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }

      await audio.play();
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : "Audio playback failed");
    }
  }, [sourceUrl]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !sourceUrl) return;

    if (!audio.paused) {
      pause();
      return;
    }

    await play();
  }, [pause, play, sourceUrl]);

  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRateState((currentRate) => {
      const currentIndex = PLAYBACK_RATES.indexOf(currentRate as (typeof PLAYBACK_RATES)[number]);
      const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length];
      const audio = audioRef.current;
      if (audio) {
        audio.playbackRate = nextRate;
      }
      return nextRate;
    });
  }, []);

  const canSeek = isFinitePositive(duration);
  const progressPercent = useMemo(() => {
    if (!canSeek) return 0;
    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  }, [canSeek, currentTime, duration]);

  return {
    audioRef,
    canSeek,
    currentTime,
    cyclePlaybackRate,
    duration,
    error,
    isPlaying,
    isReady,
    pause,
    play,
    playbackRate,
    progressPercent,
    seekTo,
    seekToPercent,
    skipBy,
    togglePlay,
  };
}

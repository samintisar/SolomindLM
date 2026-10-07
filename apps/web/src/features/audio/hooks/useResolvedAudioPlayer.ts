import { useAudioPlayer } from "./useAudioPlayer";
import { useResolvedAudioPlaybackUrl } from "./useResolvedAudioPlaybackUrl";

/**
 * Resolve an audio URL to a signed playback URL and drive an `<audio>` element with it.
 * `isResolving` while the URL loads, `isUnavailable` when it can't be resolved.
 */
export function useResolvedAudioPlayer(audioUrl: string, audioOverviewId?: string) {
  const resolvedPlayback = useResolvedAudioPlaybackUrl(audioUrl, audioOverviewId);
  const audioSource = typeof resolvedPlayback === "string" ? resolvedPlayback : null;
  const player = useAudioPlayer(audioSource);
  return {
    ...player,
    audioSource,
    isResolving: resolvedPlayback === undefined,
    isUnavailable: resolvedPlayback === null,
    canPlay: !!audioSource && !player.error,
  };
}

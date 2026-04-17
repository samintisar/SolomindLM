import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { resolveAudioPlaybackUrl } from "../utils/resolveAudioPlaybackUrl";

/**
 * `undefined` = still loading (Convex query). `null` = cannot resolve. `string` = HTTPS URL.
 */
export function useResolvedAudioPlaybackUrl(
  audioUrl: string,
  audioOverviewId?: string
): string | undefined | null {
  const serverResolved = useQuery(
    api.studio.audio.index.resolvePlaybackUrl,
    audioOverviewId ? { audioOverviewId: audioOverviewId as Id<"audioOverviews"> } : "skip"
  );

  return useMemo((): string | undefined | null => {
    if (audioOverviewId) {
      if (serverResolved === undefined) return undefined;
      return serverResolved?.url ?? null;
    }
    const u = resolveAudioPlaybackUrl(audioUrl);
    return u ? u : null;
  }, [audioOverviewId, audioUrl, serverResolved]);
}

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Resolves an audio playback URL server-side to a signed, time-limited Convex
 * storage URL. Never falls back to the unauthenticated HTTP endpoint.
 *
 * Two resolution paths:
 *  1. `audioOverviewId` provided → `resolvePlaybackUrl` (auth + ownership check)
 *  2. `audioUrl` only           → `resolveRawAudioUrl` (auth check, for legacy notes)
 *
 * Returns:
 *  - `undefined` = still loading
 *  - `null`      = cannot resolve (unauthenticated, not found, etc.)
 *  - `string`    = HTTPS URL ready for playback
 */
export function useResolvedAudioPlaybackUrl(
  audioUrl: string,
  audioOverviewId?: string
): string | undefined | null {
  // Path 1: audio overview — full ownership check
  const overviewResolved = useQuery(
    api.studio.audio.index.resolvePlaybackUrl,
    audioOverviewId ? { audioOverviewId: audioOverviewId as Id<"audioOverviews"> } : "skip"
  );

  // Path 2: raw audioUrl — auth-only check (for legacy notes without audioOverviewId)
  const rawResolved = useQuery(
    api.studio.audio.index.resolveRawAudioUrl,
    !audioOverviewId && audioUrl ? { audioUrl } : "skip"
  );

  return useMemo((): string | undefined | null => {
    if (audioOverviewId) {
      if (overviewResolved === undefined) return undefined;
      return overviewResolved?.url ?? null;
    }
    if (rawResolved === undefined) return undefined;
    return rawResolved?.url ?? null;
  }, [audioOverviewId, overviewResolved, rawResolved]);
}

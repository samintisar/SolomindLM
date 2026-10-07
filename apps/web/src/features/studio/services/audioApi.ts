import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import type { AudioOverviewNote } from "@/shared/types/index";
import { patchNoteInNotesCache, removeFromNotesCache, useOptimisticMutation } from "./notesCache";

export interface CreateAudioOverviewParams {
  notebookId: string;
  documentIds: string[];
  title?: string;
  audioType?: string;
  length?: string;
  focus?: string;
}

/**
 * Create a new audio overview and queue generation
 */
export function useCreateAudioOverview() {
  const generate = useMutation(api.studio.audio.index.generateAudioOverview);

  return useCallback(
    async (params: CreateAudioOverviewParams) => {
      const id = await generate({
        notebookId: params.notebookId as Id<"notebooks">,
        documentIds: params.documentIds as Id<"documents">[],
        title: params.title,
        audioType: params.audioType,
        length: params.length,
        focus: params.focus,
      });
      return { id, status: "generating" };
    },
    [generate]
  );
}

function patchAudioOverviewInNotesCache(
  localStore: OptimisticLocalStore,
  { id, ...updates }: { id: string } & Record<string, unknown>
): void {
  patchNoteInNotesCache(localStore, id, updates);
}

/**
 * Update an audio overview with optimistic update
 */
export function useUpdateAudioOverview() {
  const update = useOptimisticMutation(
    api.studio.audio.index.update,
    patchAudioOverviewInNotesCache
  );

  return useCallback(
    async (
      audioOverviewId: string,
      updates: Partial<Pick<AudioOverviewNote, "transcript" | "audioUrl" | "title" | "metadata">>
    ) => {
      await update({ id: audioOverviewId as Id<"audioOverviews">, ...updates });
    },
    [update]
  );
}

/**
 * Delete an audio overview by ID with optimistic update
 */
export function useDeleteAudioOverview() {
  const remove = useOptimisticMutation(api.studio.audio.index.remove, removeFromNotesCache);

  return useCallback(
    async (audioOverviewId: string) => {
      await remove({ id: audioOverviewId as Id<"audioOverviews"> });
    },
    [remove]
  );
}

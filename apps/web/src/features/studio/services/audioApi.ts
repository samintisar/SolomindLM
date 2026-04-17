import type { AudioOverviewNote } from "@/shared/types/index";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export interface CreateAudioOverviewParams {
  notebookId: string;
  documentIds: string[];
  title?: string;
  audioType?: string;
  length?: string;
  focus?: string;
}

export interface CreateAudioOverviewResponse {
  audioOverviewId: string;
  status: string;
  audioOverview: AudioOverviewNote;
}

/**
 * Map a database audio overview response to the frontend AudioOverviewNote interface
 */
function mapAudioOverviewToNote(dbAudio: any): AudioOverviewNote {
  // Audio content is stored in transcript and audioUrl fields
  const audioUrl = dbAudio.audioUrl || "";
  const transcript = dbAudio.transcript || "";

  return {
    id: dbAudio._id,
    title: dbAudio.title,
    preview: getPreviewText(dbAudio.status),
    type: "audioOverview",
    audioUrl,
    transcript,
    status: dbAudio.status,
    metadata: dbAudio.metadata || {},
  };
}

/**
 * Get preview text based on status
 */
function getPreviewText(status: string): string {
  if (status === "generating") {
    return "Audio Overview • Generating...";
  }
  if (status === "failed") {
    return "Audio Overview • Failed";
  }
  return "Audio Overview";
}

/**
 * Get all audio overviews for a notebook
 */
export function useAudioOverviews(notebookId: string | null) {
  const audioOverviews = useQuery(
    api.studio.audio.index.list,
    notebookId ? { notebookId: notebookId as Id<"notebooks"> } : "skip"
  );
  return audioOverviews?.map(mapAudioOverviewToNote) ?? [];
}

/**
 * Get a specific audio overview by ID
 */
export function useAudioOverview(audioOverviewId: string | null) {
  const audioOverview = useQuery(
    api.studio.audio.index.get,
    audioOverviewId ? { id: audioOverviewId as Id<"audioOverviews"> } : "skip"
  );
  return audioOverview ? mapAudioOverviewToNote(audioOverview) : null;
}

/**
 * Create a new audio overview and queue generation
 */
export function useCreateAudioOverview() {
  const generate = useMutation(api.studio.audio.index.generateAudioOverview);

  return async (params: CreateAudioOverviewParams): Promise<CreateAudioOverviewResponse> => {
    const result = await generate({
      notebookId: params.notebookId as Id<"notebooks">,
      documentIds: params.documentIds as Id<"documents">[],
      title: params.title,
      audioType: params.audioType,
      length: params.length,
      focus: params.focus,
    });

    return {
      audioOverviewId: result,
      status: "pending",
      audioOverview: mapAudioOverviewToNote({
        _id: result,
        status: "pending",
        title: params.title || "Audio Overview",
      }),
    };
  };
}

/**
 * Update an audio overview
 */
export function useUpdateAudioOverview() {
  const update = useMutation(api.studio.audio.index.update);

  return async (
    audioOverviewId: string,
    updates: Partial<Pick<AudioOverviewNote, "transcript" | "audioUrl" | "title" | "metadata">>
  ) => {
    return await update({
      id: audioOverviewId as Id<"audioOverviews">,
      ...updates,
    });
  };
}

/**
 * Delete an audio overview by ID
 */
export function useDeleteAudioOverview() {
  const remove = useMutation(api.studio.audio.index.remove);

  return async (audioOverviewId: string) => {
    await remove({ id: audioOverviewId as Id<"audioOverviews"> });
  };
}

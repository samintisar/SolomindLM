import type { Note, AudioOverviewNote } from '@/shared/types/index';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

export interface CreateAudioOverviewParams {
  notebookId: string;
  documentIds: string[];
  title?: string;
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
  const audioUrl = dbAudio.audioUrl || '';
  const transcript = dbAudio.transcript || '';

  return {
    id: dbAudio._id,
    title: dbAudio.title,
    preview: getPreviewText(dbAudio.status),
    type: 'audioOverview',
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
  if (status === 'generating') {
    return 'Audio Overview • Generating...';
  }
  if (status === 'failed') {
    return 'Audio Overview • Failed';
  }
  return 'Audio Overview';
}

/**
 * Get all audio overviews for a notebook
 */
export function useAudioOverviews(notebookId: string | null) {
  const audioOverviews = useQuery(
    api.audioOverviews.list,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : 'skip'
  );
  return audioOverviews?.map(mapAudioOverviewToNote) ?? [];
}

/**
 * Get a specific audio overview by ID
 */
export function useAudioOverview(audioOverviewId: string | null) {
  const audioOverview = useQuery(
    api.audioOverviews.get,
    audioOverviewId ? { id: audioOverviewId as Id<'audioOverviews'> } : 'skip'
  );
  return audioOverview ? mapAudioOverviewToNote(audioOverview) : null;
}

/**
 * Create a new audio overview and queue generation
 */
export function useCreateAudioOverview() {
  const generate = useMutation(api.audioOverviews.generateAudioOverview);

  return async (params: CreateAudioOverviewParams): Promise<CreateAudioOverviewResponse> => {
    const result = await generate({
      notebookId: params.notebookId as Id<'notebooks'>,
      documentIds: params.documentIds as Id<'documents'>[],
      title: params.title,
    });

    return {
      audioOverviewId: result,
      status: 'pending',
      audioOverview: mapAudioOverviewToNote({ _id: result, status: 'pending', title: params.title || 'Audio Overview' }),
    };
  };
}

/**
 * Update an audio overview
 */
export function useUpdateAudioOverview() {
  const update = useMutation(api.audioOverviews.update);

  return async (audioOverviewId: string, updates: Partial<Pick<AudioOverviewNote, 'transcript' | 'audioUrl' | 'title' | 'metadata'>>) => {
    return await update({
      id: audioOverviewId as Id<'audioOverviews'>,
      ...updates,
    });
  };
}

/**
 * Delete an audio overview by ID
 */
export function useDeleteAudioOverview() {
  const remove = useMutation(api.audioOverviews.remove);

  return async (audioOverviewId: string) => {
    await remove({ id: audioOverviewId as Id<'audioOverviews'> });
  };
}

/**
 * Poll audio overview status until completion.
 * Note: Audio generation may take longer than other types.
 * Pass initialNote from the create response so the first poll succeeds before
 * Convex query reactivity has added the new item to the notes list.
 */
export async function pollAudioOverviewStatus(
  getAudioOverview: () => AudioOverviewNote | null | undefined,
  onUpdate?: (note: AudioOverviewNote) => void,
  maxAttempts = 300, // 10 minutes @ 2s intervals (audio generation takes time)
  interval = 2000,
  initialNote?: AudioOverviewNote
): Promise<AudioOverviewNote> {
  for (let i = 0; i < maxAttempts; i++) {
    const note = getAudioOverview() ?? initialNote;

    if (!note) {
      throw new Error('Audio overview not found');
    }

    if (note.status === 'completed' || note.status === 'failed') {
      return note;
    }

    onUpdate?.(note);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Audio overview generation timed out');
}

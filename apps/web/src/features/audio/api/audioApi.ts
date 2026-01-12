import type { Note, AudioNote } from '@/shared/types/index';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/shared/utils/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface CreateAudioOverviewParams {
  userId: string;
  notebookId: string;
  documentIds: string[];
  audioType: string;
  length: string;
  focus?: string;
}

export interface CreateAudioOverviewResponse {
  audioOverviewId: string;
  status: string;
}

export interface AudioOverview {
  id: string;
  user_id: string;
  notebook_id: string;
  title: string;
  transcript: string | null;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  audio_type: string;
  audio_url: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Get userId from localStorage (for transition period)
 * TODO: Replace with proper auth context after migration
 */
function getUserId(): string | null {
  const storedUser = localStorage.getItem('solomind_user');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      return user.id || user.user?.id || null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Map a database audio overview response to the frontend AudioNote interface
 */
function mapAudioOverviewToNote(audioOverview: AudioOverview): AudioNote {
  const audioType = audioOverview.audio_type;
  let preview = '';

  // Determine preview based on status (stored in metadata.phase for intermediate states)
  const phase = audioOverview.metadata?.phase || audioOverview.status;
  const isGenerating =
    audioOverview.status === 'generating' ||
    phase === 'generating' ||
    phase === 'mapping' ||
    phase === 'reducing' ||
    phase === 'synthesizing';

  if (isGenerating) {
    preview = `Audio Overview • ${getAudioTypeTitle(audioType)} • Generating...`;
  } else if (audioOverview.status === 'failed' || phase === 'failed') {
    preview = `Audio Overview • ${getAudioTypeTitle(audioType)} • Failed`;
  } else if (audioOverview.status === 'completed') {
    preview = `Audio Overview • ${getAudioTypeTitle(audioType)}`;
  } else {
    preview = `Audio Overview • ${getAudioTypeTitle(audioType)}`;
  }

  return {
    id: audioOverview.id,
    title: audioOverview.title,
    preview,
    type: 'audio',
    content: audioOverview.transcript || '',
    status: audioOverview.status,
    metadata: {
      audioUrl: audioOverview.audio_url || '',
      audioType: audioOverview.audio_type,
      audioOverviewId: audioOverview.id,
      duration: audioOverview.metadata?.duration,
    },
  };
}

function getAudioTypeTitle(audioType: string): string {
  const titles: Record<string, string> = {
    deep_dive: 'Deep Dive',
    brief: 'Brief',
    critique: 'Critique',
    debate: 'Debate',
  };
  return titles[audioType] || 'Audio';
}

export const audioApi = {
  /**
   * Create a new audio overview and queue generation
   */
  async createAudioOverview(params: CreateAudioOverviewParams): Promise<CreateAudioOverviewResponse> {
    const response = await apiPost('/api/audio-overviews', params);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create audio overview');
    }

    return await response.json();
  },

  /**
   * Get a specific audio overview by ID
   */
  async getAudioOverview(audioOverviewId: string): Promise<AudioOverview> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiGet(`/api/audio-overviews/${audioOverviewId}?${params.toString()}`);

    if (!response.ok) {
      throw new Error('Failed to fetch audio overview');
    }

    return await response.json();
  },

  /**
   * Poll audio overview status until completion
   */
  async pollAudioOverview(
    audioOverviewId: string,
    onUpdate?: (note: AudioNote) => void,
    maxAttempts = 300, // 10 minutes @ 2s intervals
    interval = 2000
  ): Promise<AudioNote> {
    for (let i = 0; i < maxAttempts; i++) {
      const audioOverview = await this.getAudioOverview(audioOverviewId);
      const note = mapAudioOverviewToNote(audioOverview);

      if (audioOverview.status === 'completed' || audioOverview.status === 'failed') {
        return note;
      }

      onUpdate?.(note);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Audio overview generation timed out');
  },

  /**
   * Get all audio overviews for a notebook
   */
  async getAudioOverviewsByNotebook(notebookId: string): Promise<AudioNote[]> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiGet(`/api/audio-overviews/notebook/${notebookId}?${params.toString()}`);

    if (!response.ok) {
      throw new Error('Failed to fetch audio overviews');
    }

    const audioOverviews = await response.json();
    return audioOverviews.map(mapAudioOverviewToNote);
  },

  /**
   * Rename an audio overview by ID
   */
  async renameAudioOverview(audioOverviewId: string, newTitle: string): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiPatch(`/api/audio-overviews/${audioOverviewId}?${params.toString()}`, { title: newTitle });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to rename audio overview');
    }
  },

  /**
   * Delete an audio overview by ID
   */
  async deleteAudioOverview(audioOverviewId: string): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    await apiDelete(`/api/audio-overviews/${audioOverviewId}?${params.toString()}`);
  },
};

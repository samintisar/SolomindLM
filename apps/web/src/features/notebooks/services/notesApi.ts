import type { Note } from '@/shared/types/index';
import { apiGet, apiPatch, apiDelete } from '@/shared/utils/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

// Convert database note to UI Note format (only reports and text notes)
function dbNoteToNote(dbNote: any): Note {
  return {
    id: dbNote.id,
    title: dbNote.title,
    preview: getPreviewText(dbNote.note_type, dbNote.status, dbNote.metadata),
    type: dbNote.note_type,
    content: dbNote.content,
    status: dbNote.status,
    metadata: dbNote.metadata,
  };
}

function getPreviewText(noteType: string, status?: string, metadata?: any): string {
  if (status === 'generating' || status === 'mapping' || status === 'collapsing' || status === 'reducing') {
    return 'Generating...';
  }
  if (status === 'failed') {
    return 'Failed • Tap to retry';
  }

  switch (noteType) {
    case 'report':
      return metadata?.reportType
        ? `Report • ${formatReportType(metadata.reportType)}`
        : 'Report';
    case 'text':
      return 'Note';
    default:
      return 'Note';
  }
}

function formatReportType(reportType: string): string {
  const titles: Record<string, string> = {
    briefing: 'Briefing',
    study_guide: 'Study Guide',
    blog_post: 'Blog Post',
    summary: 'Summary',
    technical_report: 'Technical Report',
    concept_explainer: 'Concept Explainer',
    methodology_overview: 'Methodology',
    custom: 'Custom',
  };
  return titles[reportType] || reportType;
}

export const notesApi = {
  /**
   * Get all notes (reports + text notes) for a specific notebook
   */
  async getNotes(notebookId: string): Promise<Note[]> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiGet(`/api/notebooks/${notebookId}/notes?${params.toString()}`);

    if (!response.ok) {
      throw new Error('Failed to fetch notes');
    }

    const dbNotes = await response.json();
    return dbNotes.map(dbNoteToNote);
  },

  /**
   * Get a single note by ID
   */
  async getNote(noteId: string): Promise<Note> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiGet(`/api/notes/${noteId}?${params.toString()}`);

    if (!response.ok) {
      throw new Error('Failed to fetch note');
    }

    const dbNote = await response.json();
    return dbNoteToNote(dbNote);
  },

  /**
   * Rename a note
   */
  async renameNote(noteId: string, newTitle: string): Promise<Note> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiPatch(`/api/notes/${noteId}?${params.toString()}`, { title: newTitle });

    if (!response.ok) {
      throw new Error('Failed to rename note');
    }

    const dbNote = await response.json();
    return dbNoteToNote(dbNote);
  },

  /**
   * Delete a note
   */
  async deleteNote(noteId: string): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    await apiDelete(`/api/notes/${noteId}?${params.toString()}`);
  },
};

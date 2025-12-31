import type { Note, Flashcard } from '@/shared/types/index';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Get auth headers with access token
function getAuthHeaders(): HeadersInit {
  const storedUser = localStorage.getItem('solomind_user');
  if (storedUser) {
    const user = JSON.parse(storedUser);
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.accessToken}`,
    };
  }
  return {
    'Content-Type': 'application/json',
  };
}

export interface CreateFlashcardsParams {
  userId: string;
  notebookId: string;
  documentIds: string[];
  cardCount: number; // 20 (fewer), 35 (standard), or 55 (more)
  difficulty: string; // 'easy', 'medium', 'hard'
  topic?: string;
}

export interface CreateFlashcardsResponse {
  flashcardId: string;
  status: string;
  flashcard: Note;
}

/**
 * Get preview text based on status, actual flashcard count, and metadata
 */
function getPreviewText(status: string, cardCount: number, metadata?: any): string {
  const difficulty = metadata?.difficulty || 'medium';
  
  if (status === 'generating' || status === 'mapping' || status === 'collapsing' || status === 'reducing') {
    return `${cardCount} Cards • ${difficulty} • Generating...`;
  }
  if (status === 'failed') {
    return 'Flashcards • Failed';
  }
  return `${cardCount} Cards • ${difficulty}`;
}

/**
 * Map a database flashcard response to the frontend Note interface
 */
function mapFlashcardToNote(dbFlashcard: any): Note {
  // API returns 'flashcards' array (already parsed), or use 'cards_data' for raw DB responses
  const flashcards: Flashcard[] = dbFlashcard.flashcards || (dbFlashcard.cards_data ? JSON.parse(dbFlashcard.cards_data) : []);
  const actualCardCount = flashcards.length;

  return {
    id: dbFlashcard.id,
    title: dbFlashcard.title,
    preview: getPreviewText(dbFlashcard.status, actualCardCount, dbFlashcard.metadata),
    type: 'flashcard',
    flashcards,
    status: dbFlashcard.status,
    metadata: dbFlashcard.metadata,
  };
}

export const flashcardsApi = {
  /**
   * Create a new flashcard set and queue generation
   */
  async createFlashcards(params: CreateFlashcardsParams): Promise<CreateFlashcardsResponse> {
    const response = await fetch(`${API_BASE_URL}/api/flashcards`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create flashcards');
    }

    const result = await response.json();
    return {
      flashcardId: result.flashcardId,
      status: result.status,
      flashcard: mapFlashcardToNote(result.flashcard),
    };
  },

  /**
   * Get a specific flashcard set by ID
   */
  async getFlashcard(flashcardId: string): Promise<Note> {
    const storedUser = localStorage.getItem('solomind_user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/flashcards/${flashcardId}?${params.toString()}`,
      {
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch flashcard set');
    }

    const dbFlashcard = await response.json();
    return mapFlashcardToNote(dbFlashcard);
  },

  /**
   * Poll flashcard status until completion
   */
  async pollFlashcardStatus(
    flashcardId: string,
    onUpdate?: (note: Note) => void,
    maxAttempts = 180, // 6 minutes @ 2s intervals
    interval = 2000
  ): Promise<Note> {
    for (let i = 0; i < maxAttempts; i++) {
      const note = await this.getFlashcard(flashcardId);

      if (note.status === 'completed' || note.status === 'failed') {
        return note;
      }

      onUpdate?.(note);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Flashcard generation timed out');
  },

  /**
   * Get all flashcard sets for a notebook
   */
  async getFlashcards(notebookId: string): Promise<Note[]> {
    const storedUser = localStorage.getItem('solomind_user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/flashcards/notebook/${notebookId}?${params.toString()}`,
      {
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch flashcard sets');
    }

    const dbFlashcards = await response.json();
    return dbFlashcards.map(mapFlashcardToNote);
  },

  /**
   * Rename a flashcard set by ID
   */
  async renameFlashcard(flashcardId: string, newTitle: string): Promise<void> {
    const storedUser = localStorage.getItem('solomind_user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/flashcards/${flashcardId}?${params.toString()}`,
      {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ title: newTitle }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to rename flashcard set');
    }
  },

  /**
   * Delete a flashcard set by ID
   */
  async deleteFlashcard(flashcardId: string): Promise<void> {
    const storedUser = localStorage.getItem('solomind_user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/flashcards/${flashcardId}?${params.toString()}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to delete flashcard set');
    }
  },
};

import type { Note, QuizQuestion } from '@/shared/types/index';

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

export interface CreateQuizParams {
  userId: string;
  notebookId: string;
  documentIds: string[];
  questionCount: 'fewer' | 'standard' | 'more'; // 10, 20, 30
  difficulty: string; // 'easy', 'medium', 'hard'
  focus?: string;
}

export interface CreateQuizResponse {
  quizId: string;
  status: string;
  quiz: Note;
}

/**
 * Get question count label
 */
function getQuestionCountLabel(count: string | number): string {
  if (typeof count === 'string') {
    const labels: Record<string, string> = {
      fewer: '10',
      standard: '20',
      more: '30',
    };
    return labels[count] || '20';
  }
  return String(count);
}

/**
 * Get preview text based on status and metadata
 */
function getPreviewText(status: string, metadata?: any): string {
  const phase = metadata?.phase || status;
  const questionCount = metadata?.questionCount || 'standard';
  const difficulty = metadata?.difficulty || 'medium';

  const isGenerating = status === 'generating' ||
    phase === 'generating' ||
    phase === 'mapping' ||
    phase === 'collapsing' ||
    phase === 'reducing';

  if (isGenerating) {
    return `${getQuestionCountLabel(questionCount)} Questions • ${difficulty} • Generating...`;
  }
  if (status === 'failed' || phase === 'failed') {
    return 'Quiz • Failed';
  }
  return `${getQuestionCountLabel(questionCount)} Questions • ${difficulty}`;
}

/**
 * Map a database quiz response to the frontend Note interface
 */
function mapQuizToNote(dbQuiz: any): Note {
  const questions: QuizQuestion[] = dbQuiz.questions || [];

  return {
    id: dbQuiz.id,
    title: dbQuiz.title,
    preview: getPreviewText(dbQuiz.status, dbQuiz.metadata),
    type: 'quiz',
    questions,
    status: dbQuiz.status,
    metadata: dbQuiz.metadata,
  };
}

export const quizzesApi = {
  /**
   * Create a new quiz and queue generation
   */
  async createQuiz(params: CreateQuizParams): Promise<CreateQuizResponse> {
    const response = await fetch(`${API_BASE_URL}/api/quizzes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create quiz');
    }

    const result = await response.json();
    return {
      quizId: result.quizId,
      status: result.status,
      quiz: mapQuizToNote(result.quiz),
    };
  },

  /**
   * Get a specific quiz by ID
   */
  async getQuiz(quizId: string): Promise<Note> {
    const storedUser = localStorage.getItem('solomind_user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const queryParams = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/quizzes/${quizId}?${queryParams.toString()}`,
      {
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch quiz');
    }

    const dbQuiz = await response.json();
    return mapQuizToNote(dbQuiz);
  },

  /**
   * Poll quiz status until completion
   */
  async pollQuizStatus(
    quizId: string,
    onUpdate?: (note: Note) => void,
    maxAttempts = 180, // 6 minutes @ 2s intervals
    interval = 2000
  ): Promise<Note> {
    for (let i = 0; i < maxAttempts; i++) {
      const note = await this.getQuiz(quizId);

      if (note.status === 'completed' || note.status === 'failed') {
        return note;
      }

      onUpdate?.(note);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Quiz generation timed out');
  },

  /**
   * Get all quizzes for a notebook
   */
  async getQuizzes(notebookId: string): Promise<Note[]> {
    const storedUser = localStorage.getItem('solomind_user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/quizzes/notebook/${notebookId}?${params.toString()}`,
      {
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch quizzes');
    }

    const dbQuizzes = await response.json();
    return dbQuizzes.map(mapQuizToNote);
  },

  /**
   * Rename a quiz by ID
   */
  async renameQuiz(quizId: string, newTitle: string): Promise<void> {
    const storedUser = localStorage.getItem('solomind_user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/quizzes/${quizId}?${params.toString()}`,
      {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ title: newTitle }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to rename quiz');
    }
  },

  /**
   * Delete a quiz by ID
   */
  async deleteQuiz(quizId: string): Promise<void> {
    const storedUser = localStorage.getItem('solomind_user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await fetch(
      `${API_BASE_URL}/api/quizzes/${quizId}?${params.toString()}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to delete quiz');
    }
  },
};

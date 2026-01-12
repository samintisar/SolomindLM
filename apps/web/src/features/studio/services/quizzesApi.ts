import type { Note, QuizQuestion, QuizNote } from '@/shared/types/index';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/shared/utils/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
  quiz: QuizNote;
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
 * Map a database quiz response to the frontend QuizNote interface
 */
function mapQuizToNote(dbQuiz: any): QuizNote {
  const questions: QuizQuestion[] = dbQuiz.questions || [];
  const questionCount = questions.length;

  return {
    id: dbQuiz.id,
    title: dbQuiz.title,
    preview: getPreviewText(dbQuiz.status, dbQuiz.metadata),
    type: 'quiz',
    questions,
    userAnswers: dbQuiz.userAnswers || {},
    status: dbQuiz.status,
    metadata: {
      questionCount,
      difficulty: dbQuiz.metadata?.difficulty || 'medium',
      focusArea: dbQuiz.metadata?.focus,
    },
  };
}

export const quizzesApi = {
  /**
   * Create a new quiz and queue generation
   */
  async createQuiz(params: CreateQuizParams): Promise<CreateQuizResponse> {
    const response = await apiPost('/api/quizzes', params);

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
  async getQuiz(quizId: string): Promise<QuizNote> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const queryParams = new URLSearchParams({ userId });
    const response = await apiGet(`/api/quizzes/${quizId}?${queryParams.toString()}`);

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
    onUpdate?: (note: QuizNote) => void,
    maxAttempts = 180, // 6 minutes @ 2s intervals
    interval = 2000
  ): Promise<QuizNote> {
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
  async getQuizzes(notebookId: string): Promise<QuizNote[]> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiGet(`/api/quizzes/notebook/${notebookId}?${params.toString()}`);

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
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiPatch(`/api/quizzes/${quizId}?${params.toString()}`, { title: newTitle });

    if (!response.ok) {
      throw new Error('Failed to rename quiz');
    }
  },

  /**
   * Delete a quiz by ID
   */
  async deleteQuiz(quizId: string): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    await apiDelete(`/api/quizzes/${quizId}?${params.toString()}`);
  },

  /**
   * Submit an answer for a quiz question
   */
  async submitAnswer(quizId: string, questionIndex: number, selectedOption: number): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiPost(`/api/quizzes/${quizId}/submit?${params.toString()}`, { questionIndex, selectedOption });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit answer');
    }
  },

  /**
   * Reset all answers for a quiz
   */
  async resetAnswers(quizId: string): Promise<QuizNote> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    await apiPost(`/api/quizzes/${quizId}/reset?${params.toString()}`, {});

    // Fetch and return the updated quiz
    return this.getQuiz(quizId);
  },
};

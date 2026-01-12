import type { Note, WrittenQuestion, WrittenQuestionsNote } from '@/shared/types/index';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/shared/utils/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface CreateWrittenQuestionsParams {
  userId: string;
  notebookId: string;
  documentIds: string[];
  questionCount: 'fewer' | 'standard' | 'more'; // 5, 10, 15
  difficulty: string; // 'easy', 'medium', 'hard'
  questionType: 'short' | 'essay';
  focus?: string;
}

export interface CreateWrittenQuestionsResponse {
  writtenQuestionsId: string;
  status: string;
  writtenQuestions: WrittenQuestionsNote;
}

export interface SubmitAnswerParams {
  writtenQuestionsId: string;
  questionId: string;
  answer: string;
}

export interface GradedResult {
  score: number;
  maxScore: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
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
 * Get preview text based on status, actual question count, and question type
 */
function getPreviewText(status: string, questionCount: number, questionType: string): string {
  const isGenerating = status === 'generating';

  if (isGenerating) {
    return `${questionCount} Questions • ${questionType} • Generating...`;
  }
  if (status === 'failed') {
    return 'Written Questions • Failed';
  }
  return `${questionCount} Questions • ${questionType}`;
}

/**
 * Map a database written questions response to the frontend WrittenQuestionsNote interface
 */
function mapWrittenQuestionsToNote(dbWQ: any): WrittenQuestionsNote {
  const questions: WrittenQuestion[] = dbWQ.questions || [];
  const questionCount = questions.length;
  const questionType = dbWQ.question_type || 'short';

  return {
    id: dbWQ.id,
    title: dbWQ.title,
    preview: getPreviewText(dbWQ.status, questionCount, questionType),
    type: 'writtenQuestions',
    questions,
    userAnswers: dbWQ.userAnswers || {},
    status: dbWQ.status,
    metadata: {
      questionCount,
      difficulty: dbWQ.metadata?.difficulty || 'medium',
      questionType,
      focusArea: dbWQ.metadata?.focus,
    },
  };
}

export const writtenQuestionsApi = {
  /**
   * Create new written questions and queue generation
   */
  async createWrittenQuestions(params: CreateWrittenQuestionsParams): Promise<CreateWrittenQuestionsResponse> {
    const response = await apiPost('/api/written-questions', params);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create written questions');
    }

    const result = await response.json();
    return {
      writtenQuestionsId: result.writtenQuestionsId,
      status: result.status,
      writtenQuestions: mapWrittenQuestionsToNote(result.writtenQuestions),
    };
  },

  /**
   * Get a specific written questions set by ID
   */
  async getWrittenQuestions(id: string): Promise<WrittenQuestionsNote> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const queryParams = new URLSearchParams({ userId });
    const response = await apiGet(`/api/written-questions/${id}?${queryParams.toString()}`);

    if (!response.ok) {
      throw new Error('Failed to fetch written questions');
    }

    const dbWQ = await response.json();
    return mapWrittenQuestionsToNote(dbWQ);
  },

  /**
   * Poll written questions status until completion
   */
  async pollWrittenQuestionsStatus(
    id: string,
    onUpdate?: (note: WrittenQuestionsNote) => void,
    maxAttempts = 180, // 6 minutes @ 2s intervals
    interval = 2000
  ): Promise<WrittenQuestionsNote> {
    for (let i = 0; i < maxAttempts; i++) {
      const note = await this.getWrittenQuestions(id);

      if (note.status === 'completed' || note.status === 'failed') {
        return note;
      }

      onUpdate?.(note);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Written questions generation timed out');
  },

  /**
   * Submit an answer for grading
   */
  async submitAnswer(params: SubmitAnswerParams): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const queryParams = new URLSearchParams({ userId });
    const response = await apiPost(`/api/written-questions/${params.writtenQuestionsId}/submit?${queryParams.toString()}`, {
      questionId: params.questionId,
      answer: params.answer,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit answer');
    }
  },

  /**
   * Get graded result for a specific question
   */
  async getGradedResult(id: string, questionId: string): Promise<GradedResult> {
    const note = await this.getWrittenQuestions(id);
    const answer = note.userAnswers?.[questionId];

    if (!answer || !answer.graded) {
      throw new Error('Answer not yet graded');
    }

    return {
      score: answer.score || 0,
      maxScore: answer.maxScore || 0,
      feedback: answer.feedback || '',
      strengths: answer.strengths || [],
      improvements: answer.improvements || [],
    };
  },

  /**
   * Poll for graded result
   */
  async pollGradedResult(
    id: string,
    questionId: string,
    onUpdate?: (graded: boolean) => void,
    maxAttempts = 60, // 2 minutes @ 2s intervals
    interval = 2000
  ): Promise<GradedResult> {
    for (let i = 0; i < maxAttempts; i++) {
      const note = await this.getWrittenQuestions(id);
      const answer = note.userAnswers?.[questionId];

      if (answer?.graded) {
        onUpdate?.(true);
        return {
          score: answer.score || 0,
          maxScore: answer.maxScore || 0,
          feedback: answer.feedback || '',
          strengths: answer.strengths || [],
          improvements: answer.improvements || [],
        };
      }

      onUpdate?.(false);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Grading timed out');
  },

  /**
   * Get all written questions for a notebook
   */
  async getWrittenQuestionsByNotebook(notebookId: string): Promise<WrittenQuestionsNote[]> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiGet(`/api/written-questions/notebook/${notebookId}?${params.toString()}`);

    if (!response.ok) {
      throw new Error('Failed to fetch written questions');
    }

    const dbWQs = await response.json();
    return dbWQs.map(mapWrittenQuestionsToNote);
  },

  /**
   * Rename written questions by ID
   */
  async renameWrittenQuestions(id: string, newTitle: string): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiPatch(`/api/written-questions/${id}?${params.toString()}`, { title: newTitle });

    if (!response.ok) {
      throw new Error('Failed to rename written questions');
    }
  },

  /**
   * Delete written questions by ID
   */
  async deleteWrittenQuestions(id: string): Promise<void> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    await apiDelete(`/api/written-questions/${id}?${params.toString()}`);
  },

  /**
   * Reset all answers for a written questions set
   */
  async resetAnswers(id: string): Promise<WrittenQuestionsNote> {
    const userId = getUserId();

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    await fetch(`${API_BASE_URL}/api/written-questions/${id}/reset?${params.toString()}`, {
      method: 'POST',
      credentials: 'include',
    });

    // Fetch and return the updated written questions
    return this.getWrittenQuestions(id);
  },
};

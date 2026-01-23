import { Router, Request, Response } from 'express';
import { supabase } from '../config/database.js';
import { scheduleQuizGeneration } from '../utils/jobHelpers.js';
import { QuizGenerationService } from '../services/generation/QuizGenerationService.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const quizService = new QuizGenerationService();

// Configuration constants
const CONFIG = {
  QUIZ: {
    MIN_QUESTIONS: 5,
    MAX_QUESTIONS: 50,
    DEFAULT_QUESTIONS: 20,
    MIN_TITLE_LENGTH: 1,
    MAX_TITLE_LENGTH: 200,
    MAX_FOCUS_LENGTH: 200,
  },
} as const;

// Type definitions for Supabase responses
interface QuizRow {
  id: string;
  user_id: string;
  notebook_id: string;
  title: string;
  questions_data: string | null;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Validation helpers
const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const;
type DifficultyLevel = typeof DIFFICULTY_LEVELS[number];

const QUESTION_COUNTS = ['fewer', 'standard', 'more'] as const;
type QuestionCount = typeof QUESTION_COUNTS[number];

function isValidDifficulty(value: string): value is DifficultyLevel {
  return DIFFICULTY_LEVELS.includes(value as DifficultyLevel);
}

function isValidQuestionCount(value: string): value is QuestionCount {
  return QUESTION_COUNTS.includes(value as QuestionCount);
}

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function validateQuestionCount(count: number): boolean {
  return Number.isInteger(count) &&
    count >= CONFIG.QUIZ.MIN_QUESTIONS &&
    count <= CONFIG.QUIZ.MAX_QUESTIONS;
}

function validateDocumentIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every(id => typeof id === 'string' && isValidUUID(id));
}

function validateFocus(focus: unknown): focus is string {
  return typeof focus === 'string' &&
    focus.length <= CONFIG.QUIZ.MAX_FOCUS_LENGTH;
}

function validateTitle(title: unknown): boolean {
  return typeof title === 'string' &&
    title.trim().length >= CONFIG.QUIZ.MIN_TITLE_LENGTH &&
    title.trim().length <= CONFIG.QUIZ.MAX_TITLE_LENGTH;
}

// Helper function to parse questions_data from quiz row
function parseQuestionsData(quiz: QuizRow) {
  if (!quiz.questions_data) return [];

  // Handle both string (needs parsing) and array (already parsed)
  if (typeof quiz.questions_data === 'string') {
    try {
      const parsed = JSON.parse(quiz.questions_data);
      return parsed.questions || [];
    } catch {
      return [];
    }
  } else if (Array.isArray(quiz.questions_data)) {
    // questions_data is stored as array directly, return it
    return quiz.questions_data;
  }

  return [];
}

// Map question count to actual numbers
function getQuestionCountValue(count: QuestionCount): number {
  const counts = { fewer: 10, standard: 20, more: 30 };
  return counts[count] || 20;
}

// Helper function to add a job to Graphile Worker using the SDK
async function addQuizJob(
  payload: {
    quizId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
    questionCount: number;
    difficulty: string;
  },
  options?: {
    priority?: number;
    queueName?: string;
  }
) {
  try {
    await scheduleQuizGeneration(payload, options);
    console.log(`[Quizzes] Successfully added quizGeneration job`);
  } catch (error: any) {
    console.error(`[Quizzes] Failed to add quizGeneration job:`, error);

    if (error.code === '42883' || error.code === '3F000' ||
        error.message?.includes('graphile_worker') ||
        error.message?.includes('schema')) {
      throw new Error(
        'Graphile Worker is not properly configured. Please start the worker process first to initialize the database schema.'
      );
    }

    throw error;
  }
}

// POST /api/quizzes - Create quiz and queue job
router.post('/', authenticate, rateLimiter('quiz'), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { notebookId, documentIds, questionCount, difficulty, focus } = req.body;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'Quizzes',
      action: 'create_quiz',
      userId,
      notebookId,
      questionCount,
      difficulty,
      focus,
    }));

    // Validation: notebookId
    if (typeof notebookId !== 'string' || !isValidUUID(notebookId)) {
      return res.status(400).json({ error: 'Invalid notebookId format' });
    }

    // Validation: questionCount
    if (typeof questionCount !== 'string' || !isValidQuestionCount(questionCount)) {
      return res.status(400).json({ error: 'questionCount must be fewer, standard, or more' });
    }

    // Validation: difficulty
    if (typeof difficulty !== 'string' || !isValidDifficulty(difficulty)) {
      return res.status(400).json({ error: 'difficulty must be easy, medium, or hard' });
    }

    // Validation: documentIds
    if (!validateDocumentIds(documentIds)) {
      return res.status(400).json({
        error: `documentIds must be a non-empty array of valid UUIDs`
      });
    }

    // Validation: focus (optional)
    if (focus !== undefined && !validateFocus(focus)) {
      return res.status(400).json({
        error: `focus must be a string with max ${CONFIG.QUIZ.MAX_FOCUS_LENGTH} characters`
      });
    }

    // Verify user owns the notebook
    const { data: notebook, error: notebookError } = await supabase
      .from('notebooks')
      .select('user_id')
      .eq('id', notebookId)
      .single();

    if (notebookError || !notebook) {
      return res.status(404).json({ error: 'Notebook not found' });
    }

    if (notebook.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Generate a unique quiz ID
    const quizId = crypto.randomUUID();
    const actualQuestionCount = getQuestionCountValue(questionCount);

    // Create quiz entry with generating status
    const title = 'Quiz';

    // Build metadata object, excluding undefined values to avoid database errors
    const metadata: Record<string, any> = {
      documentIds,
      questionCount,
      difficulty,
      phase: 'generating',
      createdAt: new Date().toISOString(),
    };
    // Only include focus if it's defined
    if (focus !== undefined) {
      metadata.focus = focus;
    }

    const { data: quiz, error: quizError } = await supabase
      .from('quizzes')
      .insert({
        id: quizId,
        user_id: userId,
        notebook_id: notebookId,
        title,
        status: 'generating',
        questions_data: [], // Store as empty array instead of empty object
        metadata,
      })
      .select()
      .single();

    if (quizError || !quiz) {
      console.error('[Quizzes] Error creating quiz entry:', quizError);
      return res.status(500).json({ error: 'Failed to create quiz entry' });
    }

    // Queue the quiz generation job
    await addQuizJob({
      quizId,
      userId,
      notebookId,
      documentIds,
      questionCount: actualQuestionCount,
      difficulty,
    });

    // Format response to match GET endpoints (include 'questions' field)
    const questions = parseQuestionsData(quiz as QuizRow);
    return res.status(201).json({
      quizId,
      status: 'generating',
      quiz: {
        id: quiz.id,
        title: quiz.title,
        questions,
        userAnswers: quiz.metadata?.userAnswers || {},
        status: quiz.status,
        metadata: quiz.metadata,
        created_at: quiz.created_at,
        updated_at: quiz.updated_at,
      },
    });
  } catch (error) {
    console.error('[Quizzes] Error creating quiz:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create quiz',
    });
  }
});

// GET /api/quizzes/notebook/:notebookId - Get all quizzes for a notebook
router.get('/notebook/:notebookId', async (req: Request, res: Response) => {
  try {
    const { notebookId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof notebookId !== 'string' || !isValidUUID(notebookId)) {
      return res.status(400).json({ error: 'Invalid notebookId format' });
    }

    const { data: quizzes, error } = await supabase
      .from('quizzes')
      .select('*')
      .eq('notebook_id', notebookId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Quizzes] Error fetching quizzes:', error);
      return res.status(500).json({ error: 'Failed to fetch quizzes' });
    }

    const result = (quizzes || []).map((quiz: QuizRow) => ({
      id: quiz.id,
      title: quiz.title,
      questions: parseQuestionsData(quiz),
      userAnswers: quiz.metadata?.userAnswers || {},
      status: quiz.status,
      metadata: quiz.metadata,
      created_at: quiz.created_at,
      updated_at: quiz.updated_at,
    }));

    return res.json(result);
  } catch (error) {
    console.error('[Quizzes] Error fetching quizzes:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch quizzes',
    });
  }
});

// GET /api/quizzes/:quizId - Get quiz by ID
router.get('/:quizId', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof quizId !== 'string' || !isValidUUID(quizId)) {
      return res.status(400).json({ error: 'Invalid quizId format' });
    }

    const { data: quiz, error } = await supabase
      .from('quizzes')
      .select('*')
      .eq('id', quizId)
      .eq('user_id', userId)
      .single();

    if (error || !quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const questions = parseQuestionsData(quiz as QuizRow);

    return res.json({
      id: quiz.id,
      title: quiz.title,
      questions,
      userAnswers: quiz.metadata?.userAnswers || {},
      status: quiz.status,
      metadata: quiz.metadata,
      created_at: quiz.created_at,
      updated_at: quiz.updated_at,
    });
  } catch (error) {
    console.error('[Quizzes] Error fetching quiz:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch quiz',
    });
  }
});

// POST /api/quizzes/:quizId/submit - Submit answer for a quiz question
router.post('/:quizId/submit', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;
    const { questionIndex, selectedOption } = req.body;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof quizId !== 'string' || !isValidUUID(quizId)) {
      return res.status(400).json({ error: 'Invalid quizId format' });
    }

    if (typeof questionIndex !== 'number' || questionIndex < 0) {
      return res.status(400).json({ error: 'questionIndex must be a non-negative number' });
    }

    if (typeof selectedOption !== 'number' || selectedOption < 0 || selectedOption > 3) {
      return res.status(400).json({ error: 'selectedOption must be a number between 0 and 3' });
    }

    // Verify user owns the quiz
    const { data: quiz, error: fetchError } = await supabase
      .from('quizzes')
      .select('*')
      .eq('id', quizId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Parse questions to validate questionIndex
    const questions = parseQuestionsData(quiz as QuizRow);
    if (questionIndex >= questions.length) {
      return res.status(400).json({ error: 'questionIndex out of bounds' });
    }

    // Update metadata with the user answer
    const currentMetadata = quiz.metadata || {};
    const currentUserAnswers = currentMetadata.userAnswers || {};

    const updatedUserAnswers = {
      ...currentUserAnswers,
      [questionIndex]: selectedOption,
    };

    const { error: updateError } = await supabase
      .from('quizzes')
      .update({
        metadata: {
          ...currentMetadata,
          userAnswers: updatedUserAnswers,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', quizId);

    if (updateError) {
      console.error('[Quizzes] Error saving answer:', updateError);
      return res.status(500).json({ error: 'Failed to save answer' });
    }

    return res.json({
      success: true,
      message: 'Answer saved successfully',
    });
  } catch (error) {
    console.error('[Quizzes] Error submitting answer:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to submit answer',
    });
  }
});

// PATCH /api/quizzes/:quizId - Rename a quiz
router.patch('/:quizId', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;
    const { title } = req.body;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof quizId !== 'string' || !isValidUUID(quizId)) {
      return res.status(400).json({ error: 'Invalid quizId format' });
    }

    if (!validateTitle(title)) {
      return res.status(400).json({
        error: `title must be between ${CONFIG.QUIZ.MIN_TITLE_LENGTH} and ${CONFIG.QUIZ.MAX_TITLE_LENGTH} characters`
      });
    }

    // Verify user owns the quiz
    const { data: quiz, error: fetchError } = await supabase
      .from('quizzes')
      .select('user_id')
      .eq('id', quizId)
      .single();

    if (fetchError || !quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    if (quiz.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const trimmedTitle = title.trim();
    const { error: updateError } = await supabase
      .from('quizzes')
      .update({ title: trimmedTitle, updated_at: new Date().toISOString() })
      .eq('id', quizId);

    if (updateError) {
      console.error('[Quizzes] Error renaming quiz:', updateError);
      return res.status(500).json({ error: 'Failed to rename quiz' });
    }

    return res.json({ success: true, title: trimmedTitle });
  } catch (error) {
    console.error('[Quizzes] Error renaming quiz:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to rename quiz',
    });
  }
});

// POST /api/quizzes/:quizId/reset - Reset all user answers
router.post('/:quizId/reset', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof quizId !== 'string' || !isValidUUID(quizId)) {
      return res.status(400).json({ error: 'Invalid quizId format' });
    }

    // Verify user owns the quiz
    const { data: quiz, error: fetchError } = await supabase
      .from('quizzes')
      .select('*')
      .eq('id', quizId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Clear user answers from metadata
    const currentMetadata = quiz.metadata || {};
    const { error: updateError } = await supabase
      .from('quizzes')
      .update({
        metadata: {
          ...currentMetadata,
          userAnswers: {},
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', quizId);

    if (updateError) {
      console.error('[Quizzes] Error resetting answers:', updateError);
      return res.status(500).json({ error: 'Failed to reset answers' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[Quizzes] Error resetting answers:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to reset answers',
    });
  }
});

// DELETE /api/quizzes/:quizId - Delete a quiz
router.delete('/:quizId', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof quizId !== 'string' || !isValidUUID(quizId)) {
      return res.status(400).json({ error: 'Invalid quizId format' });
    }

    // Verify user owns the quiz
    const { data: quiz, error: fetchError } = await supabase
      .from('quizzes')
      .select('user_id')
      .eq('id', quizId)
      .single();

    if (fetchError || !quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    if (quiz.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error: deleteError } = await supabase
      .from('quizzes')
      .delete()
      .eq('id', quizId);

    if (deleteError) {
      console.error('[Quizzes] Error deleting quiz:', deleteError);
      return res.status(500).json({ error: 'Failed to delete quiz' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[Quizzes] Error deleting quiz:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete quiz',
    });
  }
});

export default router;

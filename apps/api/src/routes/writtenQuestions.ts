import { Router, Request, Response } from 'express';
import { supabase } from '../config/database.js';
import { scheduleWrittenQuestionsGeneration } from '../utils/jobHelpers.js';

const router = Router();

// Configuration constants
const CONFIG = {
  WRITTEN_QUESTIONS: {
    MIN_QUESTIONS: 1,
    MAX_QUESTIONS: 20,
    MIN_TITLE_LENGTH: 1,
    MAX_TITLE_LENGTH: 200,
    MAX_FOCUS_LENGTH: 500,
    MAX_DOCUMENTS: 10,
  },
} as const;

// Type definitions for Supabase responses
interface WrittenQuestionsRow {
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

interface WrittenQuestion {
  id: string;
  question: string;
  questionType: 'short' | 'essay';
  rubric: {
    maxPoints: number;
    criteria: string[];
  };
  modelAnswer?: string;
}

// Validation helpers
const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const;
type DifficultyLevel = typeof DIFFICULTY_LEVELS[number];

const QUESTION_COUNTS = ['fewer', 'standard', 'more'] as const;
type QuestionCount = typeof QUESTION_COUNTS[number];

const QUESTION_TYPES = ['short', 'essay', 'mixed'] as const;
type QuestionType = typeof QUESTION_TYPES[number];

function isValidDifficulty(value: string): value is DifficultyLevel {
  return DIFFICULTY_LEVELS.includes(value as DifficultyLevel);
}

function isValidQuestionCount(value: string): value is QuestionCount {
  return QUESTION_COUNTS.includes(value as QuestionCount);
}

function isValidQuestionType(value: string): value is QuestionType {
  return QUESTION_TYPES.includes(value as QuestionType);
}

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function validateQuestionCount(count: number): boolean {
  return Number.isInteger(count) &&
    count >= CONFIG.WRITTEN_QUESTIONS.MIN_QUESTIONS &&
    count <= CONFIG.WRITTEN_QUESTIONS.MAX_QUESTIONS;
}

function validateDocumentIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= CONFIG.WRITTEN_QUESTIONS.MAX_DOCUMENTS &&
    ids.every(id => typeof id === 'string' && isValidUUID(id));
}

function validateFocus(focus: unknown): focus is string {
  return typeof focus === 'string' &&
    focus.length <= CONFIG.WRITTEN_QUESTIONS.MAX_FOCUS_LENGTH;
}

function validateTitle(title: unknown): boolean {
  return typeof title === 'string' &&
    title.trim().length >= CONFIG.WRITTEN_QUESTIONS.MIN_TITLE_LENGTH &&
    title.trim().length <= CONFIG.WRITTEN_QUESTIONS.MAX_TITLE_LENGTH;
}

// Helper function to parse questions_data from written questions row
function parseQuestionsData(wq: WrittenQuestionsRow): WrittenQuestion[] {
  if (!wq.questions_data) {
    return [];
  }

  // Handle both string (during initial insert) and object (Supabase jsonb auto-parse)
  try {
    const data = typeof wq.questions_data === 'string'
      ? JSON.parse(wq.questions_data)
      : wq.questions_data;
    return data.questions || [];
  } catch (error) {
    console.error('[WrittenQuestions] Error parsing questions_data:', error);
    return [];
  }
}

// Map question count to actual numbers
function getQuestionCountValue(count: QuestionCount): number {
  const counts = { fewer: 5, standard: 10, more: 15 };
  return counts[count] || 10;
}

// Helper function to add a job to Graphile Worker using the SDK
async function addWrittenQuestionsJob(
  payload: {
    writtenQuestionId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
    questionCount: number;
  },
  options?: {
    priority?: number;
    queueName?: string;
  }
) {
  try {
    await scheduleWrittenQuestionsGeneration(payload, options);
    console.log(`[WrittenQuestions] Successfully added writtenQuestionsGeneration job`);
  } catch (error: any) {
    console.error(`[WrittenQuestions] Failed to add writtenQuestionsGeneration job:`, error);

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

// POST /api/written-questions - Create written questions and queue job
router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, notebookId, documentIds, questionCount, difficulty, questionType, focus } = req.body;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'WrittenQuestions',
      action: 'create_written_questions',
      userId,
      notebookId,
      questionCount,
      difficulty,
      questionType,
      focus,
    }));

    // Validation: userId and notebookId
    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }
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

    // Validation: questionType
    if (typeof questionType !== 'string' || !isValidQuestionType(questionType)) {
      return res.status(400).json({ error: 'questionType must be short, essay, or mixed' });
    }

    // Validation: documentIds
    if (!validateDocumentIds(documentIds)) {
      return res.status(400).json({
        error: `documentIds must be an array of 1-${CONFIG.WRITTEN_QUESTIONS.MAX_DOCUMENTS} valid UUIDs`
      });
    }

    // Validation: focus (optional)
    if (focus !== undefined && !validateFocus(focus)) {
      return res.status(400).json({
        error: `focus must be a string with max ${CONFIG.WRITTEN_QUESTIONS.MAX_FOCUS_LENGTH} characters`
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

    // Generate a unique written questions ID
    const writtenQuestionsId = crypto.randomUUID();
    const actualQuestionCount = getQuestionCountValue(questionCount);

    // Create written questions entry with generating status
    const title = 'Written Questions';
    const { data: writtenQuestions, error: createError } = await supabase
      .from('written_questions')
      .insert({
        id: writtenQuestionsId,
        user_id: userId,
        notebook_id: notebookId,
        title,
        status: 'generating',
        questions_data: [],
        metadata: {
          documentIds,
          questionCount: actualQuestionCount,
          difficulty,
          questionType,
          focus,
          phase: 'generating',
          createdAt: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (createError || !writtenQuestions) {
      console.error('[WrittenQuestions] Error creating written questions entry:', createError);
      return res.status(500).json({ error: 'Failed to create written questions entry' });
    }

    // Queue the written questions generation job
    await addWrittenQuestionsJob({
      writtenQuestionsId,
      userId,
      notebookId,
      documentIds,
      questionCount: actualQuestionCount,
      difficulty,
      questionType,
      focus,
    });

    return res.status(201).json({
      writtenQuestionsId,
      status: 'generating',
      writtenQuestions,
    });
  } catch (error) {
    console.error('[WrittenQuestions] Error creating written questions:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create written questions',
    });
  }
});

// GET /api/written-questions/notebook/:notebookId - Get all written questions for a notebook
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

    const { data: writtenQuestions, error } = await supabase
      .from('written_questions')
      .select('*')
      .eq('notebook_id', notebookId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[WrittenQuestions] Error fetching written questions:', error);
      return res.status(500).json({ error: 'Failed to fetch written questions' });
    }

    const result = (writtenQuestions || []).map((wq: WrittenQuestionsRow) => ({
      id: wq.id,
      title: wq.title,
      questions: parseQuestionsData(wq),
      userAnswers: wq.metadata?.userAnswers || {},
      status: wq.status,
      metadata: wq.metadata,
      created_at: wq.created_at,
      updated_at: wq.updated_at,
    }));

    return res.json(result);
  } catch (error) {
    console.error('[WrittenQuestions] Error fetching written questions:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch written questions',
    });
  }
});

// GET /api/written-questions/:id - Get written questions by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof id !== 'string' || !isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid written questions ID format' });
    }

    const { data: wq, error } = await supabase
      .from('written_questions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !wq) {
      return res.status(404).json({ error: 'Written questions not found' });
    }

    const questions = parseQuestionsData(wq as WrittenQuestionsRow);

    return res.json({
      id: wq.id,
      title: wq.title,
      questions,
      userAnswers: wq.metadata?.userAnswers || {},
      status: wq.status,
      metadata: wq.metadata,
      created_at: wq.created_at,
      updated_at: wq.updated_at,
    });
  } catch (error) {
    console.error('[WrittenQuestions] Error fetching written questions:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch written questions',
    });
  }
});

// POST /api/written-questions/:id/submit - Submit answer for grading
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { questionId, answer } = req.body;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof id !== 'string' || !isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid written questions ID format' });
    }

    if (typeof questionId !== 'string' || !questionId) {
      return res.status(400).json({ error: 'questionId is required' });
    }

    if (typeof answer !== 'string' || !answer.trim()) {
      return res.status(400).json({ error: 'answer is required' });
    }

    // Verify user owns the written questions
    const { data: wq, error: fetchError } = await supabase
      .from('written_questions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !wq) {
      return res.status(404).json({ error: 'Written questions not found' });
    }

    // Parse questions data to find the question being answered
    const questions = parseQuestionsData(wq as WrittenQuestionsRow);
    const questionToGrade = questions.find(q => q.id === questionId);

    if (!questionToGrade) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Import grading service
    const { WrittenQuestionsGradingService } = await import('../services/grading/WrittenQuestionsGradingService.js');
    const gradingService = new WrittenQuestionsGradingService();

    // Grade the answer
    const gradingResult = await gradingService.gradeAnswer({
      question: questionToGrade,
      userAnswer: answer.trim(),
      referenceContext: wq.metadata?.focusArea,
    });

    // Update metadata with the graded answer
    const currentMetadata = wq.metadata || {};
    const currentUserAnswers = currentMetadata.userAnswers || {};

    const updatedUserAnswers = {
      ...currentUserAnswers,
      [questionId]: {
        answer: answer.trim(),
        graded: true,
        score: gradingResult.score,
        maxScore: gradingResult.maxScore,
        feedback: gradingResult.feedback,
        strengths: gradingResult.strengths,
        improvements: gradingResult.improvements,
        submittedAt: new Date().toISOString(),
        gradedAt: new Date().toISOString(),
      },
    };

    const { error: updateError } = await supabase
      .from('written_questions')
      .update({
        metadata: {
          ...currentMetadata,
          userAnswers: updatedUserAnswers,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('[WrittenQuestions] Error saving graded answer:', updateError);
      return res.status(500).json({ error: 'Failed to save graded answer' });
    }

    return res.json({
      success: true,
      message: 'Answer graded successfully',
      gradingResult: {
        score: gradingResult.score,
        maxScore: gradingResult.maxScore,
        feedback: gradingResult.feedback,
        strengths: gradingResult.strengths,
        improvements: gradingResult.improvements,
      },
    });
  } catch (error) {
    console.error('[WrittenQuestions] Error submitting answer:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to submit answer',
    });
  }
});

// PATCH /api/written-questions/:id - Rename written questions
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof id !== 'string' || !isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid written questions ID format' });
    }

    if (!validateTitle(title)) {
      return res.status(400).json({
        error: `title must be between ${CONFIG.WRITTEN_QUESTIONS.MIN_TITLE_LENGTH} and ${CONFIG.WRITTEN_QUESTIONS.MAX_TITLE_LENGTH} characters`
      });
    }

    // Verify user owns the written questions
    const { data: wq, error: fetchError } = await supabase
      .from('written_questions')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !wq) {
      return res.status(404).json({ error: 'Written questions not found' });
    }

    if (wq.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const trimmedTitle = title.trim();
    const { error: updateError } = await supabase
      .from('written_questions')
      .update({ title: trimmedTitle, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      console.error('[WrittenQuestions] Error renaming written questions:', updateError);
      return res.status(500).json({ error: 'Failed to rename written questions' });
    }

    return res.json({ success: true, title: trimmedTitle });
  } catch (error) {
    console.error('[WrittenQuestions] Error renaming written questions:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to rename written questions',
    });
  }
});

// POST /api/written-questions/:id/reset - Reset all user answers
router.post('/:id/reset', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof id !== 'string' || !isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid written questions ID format' });
    }

    // Verify user owns the written questions
    const { data: wq, error: fetchError } = await supabase
      .from('written_questions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !wq) {
      return res.status(404).json({ error: 'Written questions not found' });
    }

    // Clear user answers from metadata
    const currentMetadata = wq.metadata || {};
    const { error: updateError } = await supabase
      .from('written_questions')
      .update({
        metadata: {
          ...currentMetadata,
          userAnswers: {},
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('[WrittenQuestions] Error resetting answers:', updateError);
      return res.status(500).json({ error: 'Failed to reset answers' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[WrittenQuestions] Error resetting answers:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to reset answers',
    });
  }
});

// DELETE /api/written-questions/:id - Delete written questions
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof id !== 'string' || !isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid written questions ID format' });
    }

    // Verify user owns the written questions
    const { data: wq, error: fetchError } = await supabase
      .from('written_questions')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !wq) {
      return res.status(404).json({ error: 'Written questions not found' });
    }

    if (wq.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error: deleteError } = await supabase
      .from('written_questions')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[WrittenQuestions] Error deleting written questions:', deleteError);
      return res.status(500).json({ error: 'Failed to delete written questions' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[WrittenQuestions] Error deleting written questions:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete written questions',
    });
  }
});

export default router;

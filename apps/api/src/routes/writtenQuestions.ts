import { Router, Request, Response } from 'express';
import { supabase } from '../config/database.js';
import { scheduleWrittenQuestionsGeneration } from '../utils/jobHelpers.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Configuration constants
const CONFIG = {
  WRITTEN_QUESTIONS: {
    MIN_QUESTIONS: 1,
    MAX_QUESTIONS: 20,
    MIN_TITLE_LENGTH: 1,
    MAX_TITLE_LENGTH: 200,
    MAX_FOCUS_LENGTH: 500,
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
  question_type: 'short' | 'essay';
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

const QUESTION_TYPES = ['short', 'essay'] as const;
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

  // Handle both string (during initial insert) and object/array (Supabase jsonb auto-parse)
  try {
    let data: any;

    // Handle double-encoded JSON (text containing JSON string)
    if (typeof wq.questions_data === 'string') {
      const firstParse = JSON.parse(wq.questions_data);
      // If the first parse gives us a string, parse again
      if (typeof firstParse === 'string') {
        data = JSON.parse(firstParse);
      } else {
        data = firstParse;
      }
    } else {
      data = wq.questions_data;
    }

    // Handle structured format { questions: [...] } or direct array [...]
    let questions: WrittenQuestion[] = Array.isArray(data) ? data : (data.questions || []);

    // Ensure all questions have valid IDs (assign UUIDs to any with empty/missing IDs)
    questions = questions.map(q => ({
      ...q,
      id: (q.id && q.id.trim()) ? q.id : crypto.randomUUID(),
    }));

    return questions;
  } catch (error) {
    console.error('[WrittenQuestions] Error parsing questions_data:', error);
    return [];
  }
}

/**
 * Fetches document content from document_chunks for the given document IDs.
 * Returns a concatenated string of all document content for grounding the grading.
 */
async function fetchDocumentsContent(documentIds: string[]): Promise<string> {
  if (!documentIds || documentIds.length === 0) {
    return '';
  }

  try {
    // Fetch all chunks for the given documents
    const { data: chunks, error } = await supabase
      .from('document_chunks')
      .select('content, document_id')
      .in('document_id', documentIds)
      .order('chunk_index', { ascending: true });

    if (error) {
      console.error('[WrittenQuestions] Error fetching document chunks:', error);
      return '';
    }

    if (!chunks || chunks.length === 0) {
      console.warn('[WrittenQuestions] No document chunks found for IDs:', documentIds);
      return '';
    }

    // Group chunks by document and concatenate
    const chunksByDocument = chunks.reduce((acc, chunk) => {
      if (!acc[chunk.document_id]) {
        acc[chunk.document_id] = [];
      }
      acc[chunk.document_id].push(chunk.content);
      return acc;
    }, {} as Record<string, string[]>);

    // Join all documents with document separators
    const allDocumentsContent = Object.values(chunksByDocument)
      .map(docChunks => docChunks.join('\n\n'))
      .join('\n\n---\n\n');

    console.log(`[WrittenQuestions] Fetched ${chunks.length} chunks from ${Object.keys(chunksByDocument).length} documents`);
    return allDocumentsContent;
  } catch (error) {
    console.error('[WrittenQuestions] Error fetching documents content:', error);
    return '';
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
    difficulty: string;
    questionType: string;
    focus?: string;
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
router.post('/', authenticate, rateLimiter('written_questions'), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { notebookId, documentIds, questionCount, difficulty, questionType, focus } = req.body;

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

    // Validation: questionType
    if (typeof questionType !== 'string' || !isValidQuestionType(questionType)) {
      return res.status(400).json({ error: 'questionType must be short or essay' });
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

    // Build metadata object, excluding undefined values to avoid database errors
    const metadata: Record<string, any> = {
      documentIds,
      questionCount: actualQuestionCount,
      difficulty,
      phase: 'generating',
      createdAt: new Date().toISOString(),
    };
    // Only include focus if it's defined
    if (focus !== undefined) {
      metadata.focus = focus;
    }

    const { data: writtenQuestions, error: createError } = await supabase
      .from('written_questions')
      .insert({
        id: writtenQuestionsId,
        user_id: userId,
        notebook_id: notebookId,
        title,
        status: 'generating',
        question_type: questionType,
        questions_data: [],
        metadata,
      })
      .select()
      .single();

    if (createError || !writtenQuestions) {
      console.error('[WrittenQuestions] Error creating written questions entry:', createError);
      return res.status(500).json({ error: 'Failed to create written questions entry' });
    }

    // Queue the written questions generation job
    await addWrittenQuestionsJob({
      writtenQuestionId: writtenQuestionsId,
      userId,
      notebookId,
      documentIds,
      questionCount: actualQuestionCount,
      difficulty,
      questionType,
      focus,
    });

    // Format response to match GET endpoints (include 'questions' field)
    const questions = parseQuestionsData(writtenQuestions as WrittenQuestionsRow);
    return res.status(201).json({
      writtenQuestionsId,
      status: 'generating',
      writtenQuestions: {
        id: writtenQuestions.id,
        title: writtenQuestions.title,
        questions,
        userAnswers: writtenQuestions.metadata?.userAnswers || {},
        status: writtenQuestions.status,
        question_type: writtenQuestions.question_type,
        metadata: writtenQuestions.metadata,
        created_at: writtenQuestions.created_at,
        updated_at: writtenQuestions.updated_at,
      },
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
      question_type: wq.question_type,
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
      question_type: wq.question_type,
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

    // Fetch source document content for grounded grading
    const sourceContent = await fetchDocumentsContent(wq.metadata?.documentIds || []);

    // Grade the answer with source material for grounding
    const gradingResult = await gradingService.gradeAnswer({
      question: questionToGrade,
      userAnswer: answer.trim(),
      referenceContext: sourceContent || wq.metadata?.focus,
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

// GET /api/written-questions/:id/stream - SSE endpoint for real-time updates
router.get('/:id/stream', async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.query.userId as string;

  // Validation
  if (typeof userId !== 'string' || !isValidUUID(userId)) {
    return res.status(400).json({ error: 'Invalid userId format' });
  }

  if (typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid written questions ID format' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Enable CORS for SSE
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.setHeader('Access-Control-Allow-Origin', frontendUrl);
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

  // Security: Avoid logging user ID to prevent correlation attacks
  console.log(`[WrittenQuestions] SSE stream opened for ${id}`);

  // Verify user owns the written questions
  const { data: wq, error: fetchError } = await supabase
    .from('written_questions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !wq) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Written questions not found' })}\n\n`);
    res.end();
    return;
  }

  // Send initial state
  const questions = parseQuestionsData(wq as WrittenQuestionsRow);
  res.write(`data: ${JSON.stringify({
    type: 'init',
    data: {
      id: wq.id,
      title: wq.title,
      questions,
      userAnswers: wq.metadata?.userAnswers || {},
      status: wq.status,
      question_type: wq.question_type,
      metadata: wq.metadata,
      created_at: wq.created_at,
      updated_at: wq.updated_at,
    }
  })}\n\n`);

  // If already completed or failed, close the stream
  if (wq.status === 'completed' || wq.status === 'failed') {
    res.write(`data: ${JSON.stringify({ type: 'done', status: wq.status })}\n\n`);
    res.end();
    return;
  }

  // Polling interval
  const POLL_INTERVAL = 1000; // 1 second
  let lastMetadata = JSON.stringify(wq.metadata);
  let lastQuestionsHash = JSON.stringify(questions);

  const pollInterval = setInterval(async () => {
    try {
      // Fetch latest state
      const { data: currentWq, error: pollError } = await supabase
        .from('written_questions')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (pollError || !currentWq) {
        clearInterval(pollInterval);
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Failed to fetch updates' })}\n\n`);
        res.end();
        return;
      }

      const currentQuestions = parseQuestionsData(currentWq as WrittenQuestionsRow);
      const currentMetadata = JSON.stringify(currentWq.metadata);
      const currentQuestionsHash = JSON.stringify(currentQuestions);

      // Check if anything changed
      const metadataChanged = currentMetadata !== lastMetadata;
      const questionsChanged = currentQuestionsHash !== lastQuestionsHash;
      const statusChanged = currentWq.status !== wq.status;

      if (metadataChanged || questionsChanged || statusChanged) {
        // Send progress update
        if (currentWq.metadata?.phase) {
          res.write(`data: ${JSON.stringify({
            type: 'progress',
            phase: currentWq.metadata.phase,
            status: currentWq.status,
            metadata: currentWq.metadata,
          })}\n\n`);
        }

        // If questions changed (final result), send them
        if (questionsChanged && currentQuestions.length > 0) {
          res.write(`data: ${JSON.stringify({
            type: 'questions',
            questions: currentQuestions,
            title: currentWq.title,
          })}\n\n`);
        }

        // If status changed, send update
        if (statusChanged) {
          res.write(`data: ${JSON.stringify({
            type: 'status',
            status: currentWq.status,
          })}\n\n`);
        }

        // Update caches
        lastMetadata = currentMetadata;
        lastQuestionsHash = currentQuestionsHash;
        wq.status = currentWq.status;
      }

      // Send heartbeat
      res.write(': heartbeat\n\n');

      // Check if completed or failed
      if (currentWq.status === 'completed' || currentWq.status === 'failed') {
        clearInterval(pollInterval);
        res.write(`data: ${JSON.stringify({
          type: 'done',
          status: currentWq.status,
          data: {
            id: currentWq.id,
            title: currentWq.title,
            questions: currentQuestions,
            userAnswers: currentWq.metadata?.userAnswers || {},
            status: currentWq.status,
            question_type: currentWq.question_type,
            metadata: currentWq.metadata,
            created_at: currentWq.created_at,
            updated_at: currentWq.updated_at,
          }
        })}\n\n`);
        res.end();
        console.log(`[WrittenQuestions] SSE stream closed for ${id} with status: ${currentWq.status}`);
      }
    } catch (error) {
      clearInterval(pollInterval);
      console.error('[WrittenQuestions] SSE poll error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream error' })}\n\n`);
      res.end();
    }
  }, POLL_INTERVAL);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(pollInterval);
    console.log(`[WrittenQuestions] SSE stream closed for ${id} (client disconnect)`);
  });
});

export default router;

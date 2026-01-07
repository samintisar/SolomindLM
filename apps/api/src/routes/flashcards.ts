import { Router, Request, Response } from 'express';
import { supabase } from '../config/database.js';
import { scheduleFlashcardGeneration } from '../utils/jobHelpers.js';
import { FlashcardGenerationService } from '../services/generation/FlashcardGenerationService.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const flashcardService = new FlashcardGenerationService();

// Configuration constants
const CONFIG = {
  FLASHCARD: {
    MIN_CARDS: 10,
    MAX_CARDS: 100,
    DEFAULT_CARDS: 35,
    MIN_TITLE_LENGTH: 1,
    MAX_TITLE_LENGTH: 200,
    MAX_TOPIC_LENGTH: 200,
  },
} as const;

// Type definitions for Supabase responses
interface FlashcardRow {
  id: string;
  user_id: string;
  notebook_id: string;
  title: string;
  cards_data: string | null;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Validation helpers
const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const;
type DifficultyLevel = typeof DIFFICULTY_LEVELS[number];

function isValidDifficulty(value: string): value is DifficultyLevel {
  return DIFFICULTY_LEVELS.includes(value as DifficultyLevel);
}

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function validateCardCount(count: number): boolean {
  return Number.isInteger(count) &&
    count >= CONFIG.FLASHCARD.MIN_CARDS &&
    count <= CONFIG.FLASHCARD.MAX_CARDS;
}

function validateDocumentIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every(id => typeof id === 'string' && isValidUUID(id));
}

function validateTopic(topic: unknown): topic is string {
  return typeof topic === 'string' &&
    topic.length <= CONFIG.FLASHCARD.MAX_TOPIC_LENGTH;
}

function validateTitle(title: unknown): boolean {
  return typeof title === 'string' &&
    title.trim().length >= CONFIG.FLASHCARD.MIN_TITLE_LENGTH &&
    title.trim().length <= CONFIG.FLASHCARD.MAX_TITLE_LENGTH;
}

// Helper function to parse cards_data from flashcard row
function parseCardsData(flashcard: FlashcardRow) {
  if (!flashcard.cards_data) return [];

  // Handle both string (needs parsing) and array (already parsed)
  if (typeof flashcard.cards_data === 'string') {
    try {
      return JSON.parse(flashcard.cards_data);
    } catch {
      return [];
    }
  } else if (Array.isArray(flashcard.cards_data)) {
    return flashcard.cards_data;
  }

  // Handle empty objects or other non-array values
  return [];
}

// Helper function to add a job to Graphile Worker using the SDK
async function addFlashcardJob(
  payload: {
    flashcardId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
    cardCount: number;
    difficulty: string;
    topic?: string;
  },
  options?: {
    priority?: number;
    queueName?: string;
  }
) {
  try {
    await scheduleFlashcardGeneration(payload, options);
    console.log(`[Flashcards] Successfully added flashcardGeneration job`);
  } catch (error: any) {
    console.error(`[Flashcards] Failed to add flashcardGeneration job:`, error);

    // Check if it's a missing function/schema error
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

// POST /api/flashcards - Create flashcard set and queue job
router.post('/', rateLimiter('flashcard'), async (req: Request, res: Response) => {
  try {
    const { userId, notebookId, documentIds, cardCount, difficulty, topic } = req.body;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'Flashcards',
      action: 'create_flashcard',
      userId,
      notebookId,
      cardCount,
      difficulty,
    }));

    // Validation: userId and notebookId
    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }
    if (typeof notebookId !== 'string' || !isValidUUID(notebookId)) {
      return res.status(400).json({ error: 'Invalid notebookId format' });
    }

    // Validation: cardCount
    if (typeof cardCount !== 'number' || !validateCardCount(cardCount)) {
      return res.status(400).json({
        error: `cardCount must be between ${CONFIG.FLASHCARD.MIN_CARDS} and ${CONFIG.FLASHCARD.MAX_CARDS}`
      });
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

    // Validation: topic (optional) with length check
    if (topic !== undefined && !validateTopic(topic)) {
      return res.status(400).json({
        error: `topic must be a string with max ${CONFIG.FLASHCARD.MAX_TOPIC_LENGTH} characters`
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

    // Generate a unique flashcard ID
    const flashcardId = crypto.randomUUID();

    // Create flashcard entry with generating status
    // Initial title is a simple placeholder - AI will generate a descriptive title later
    const title = 'Flashcards';

    // Build metadata object, excluding undefined values to avoid database errors
    const metadata: Record<string, any> = {
      documentIds,
      cardCount,
      difficulty,
      phase: 'generating',
      createdAt: new Date().toISOString(),
    };
    // Only include topic if it's defined
    if (topic !== undefined) {
      metadata.topic = topic;
    }

    const { data: flashcard, error: flashcardError } = await supabase
      .from('flashcards')
      .insert({
        id: flashcardId,
        user_id: userId,
        notebook_id: notebookId,
        title,
        status: 'generating',
        cards_data: [], // Store as empty array instead of empty object
        metadata,
      })
      .select()
      .single();

    if (flashcardError || !flashcard) {
      console.error('[Flashcards] Error creating flashcard entry:', flashcardError);
      return res.status(500).json({ error: 'Failed to create flashcard entry' });
    }

    // Queue the flashcard generation job
    await addFlashcardJob({
      flashcardId,
      userId,
      notebookId,
      documentIds,
      cardCount,
      difficulty,
      topic,
    });

    return res.status(201).json({
      flashcardId,
      status: 'generating',
      flashcard,
    });
  } catch (error) {
    console.error('[Flashcards] Error creating flashcard set:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create flashcard set',
    });
  }
});

// GET /api/flashcards/notebook/:notebookId - Get all flashcard sets for a notebook
// MUST come before /:flashcardId route to avoid route conflicts
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

    const { data: flashcards, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('notebook_id', notebookId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Flashcards] Error fetching flashcard sets:', error);
      return res.status(500).json({ error: 'Failed to fetch flashcard sets' });
    }

    // Parse cards_data using helper for each flashcard set
    const result = (flashcards || []).map((flashcard: FlashcardRow) => ({
      id: flashcard.id,
      title: flashcard.title,
      flashcards: parseCardsData(flashcard),
      status: flashcard.status,
      metadata: flashcard.metadata,
      created_at: flashcard.created_at,
      updated_at: flashcard.updated_at,
    }));

    return res.json(result);
  } catch (error) {
    console.error('[Flashcards] Error fetching flashcard sets:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch flashcard sets',
    });
  }
});

// GET /api/flashcards/:flashcardId - Get flashcard set by ID
// MUST come after /notebook/:notebookId to avoid route conflicts
router.get('/:flashcardId', async (req: Request, res: Response) => {
  try {
    const { flashcardId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof flashcardId !== 'string' || !isValidUUID(flashcardId)) {
      return res.status(400).json({ error: 'Invalid flashcardId format' });
    }

    const { data: flashcard, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('id', flashcardId)
      .eq('user_id', userId)
      .single();

    if (error || !flashcard) {
      return res.status(404).json({ error: 'Flashcard set not found' });
    }

    // Parse cards_data using helper
    const flashcards = parseCardsData(flashcard as FlashcardRow);

    return res.json({
      id: flashcard.id,
      title: flashcard.title,
      flashcards,
      status: flashcard.status,
      metadata: flashcard.metadata,
      created_at: flashcard.created_at,
      updated_at: flashcard.updated_at,
    });
  } catch (error) {
    console.error('[Flashcards] Error fetching flashcard set:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch flashcard set',
    });
  }
});

// PATCH /api/flashcards/:flashcardId - Rename a flashcard set
router.patch('/:flashcardId', async (req: Request, res: Response) => {
  try {
    const { flashcardId } = req.params;
    const { title } = req.body;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof flashcardId !== 'string' || !isValidUUID(flashcardId)) {
      return res.status(400).json({ error: 'Invalid flashcardId format' });
    }

    if (!validateTitle(title)) {
      return res.status(400).json({
        error: `title must be between ${CONFIG.FLASHCARD.MIN_TITLE_LENGTH} and ${CONFIG.FLASHCARD.MAX_TITLE_LENGTH} characters`
      });
    }

    // Verify user owns the flashcard set
    const { data: flashcard, error: fetchError } = await supabase
      .from('flashcards')
      .select('user_id')
      .eq('id', flashcardId)
      .single();

    if (fetchError || !flashcard) {
      return res.status(404).json({ error: 'Flashcard set not found' });
    }

    if (flashcard.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const trimmedTitle = title.trim();
    const { error: updateError } = await supabase
      .from('flashcards')
      .update({ title: trimmedTitle, updated_at: new Date().toISOString() })
      .eq('id', flashcardId);

    if (updateError) {
      console.error('[Flashcards] Error renaming flashcard set:', updateError);
      return res.status(500).json({ error: 'Failed to rename flashcard set' });
    }

    return res.json({ success: true, title: trimmedTitle });
  } catch (error) {
    console.error('[Flashcards] Error renaming flashcard set:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to rename flashcard set',
    });
  }
});

// DELETE /api/flashcards/:flashcardId - Delete a flashcard set
router.delete('/:flashcardId', async (req: Request, res: Response) => {
  try {
    const { flashcardId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof flashcardId !== 'string' || !isValidUUID(flashcardId)) {
      return res.status(400).json({ error: 'Invalid flashcardId format' });
    }

    // Verify user owns the flashcard set
    const { data: flashcard, error: fetchError } = await supabase
      .from('flashcards')
      .select('user_id')
      .eq('id', flashcardId)
      .single();

    if (fetchError || !flashcard) {
      return res.status(404).json({ error: 'Flashcard set not found' });
    }

    if (flashcard.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error: deleteError } = await supabase
      .from('flashcards')
      .delete()
      .eq('id', flashcardId);

    if (deleteError) {
      console.error('[Flashcards] Error deleting flashcard set:', deleteError);
      return res.status(500).json({ error: 'Failed to delete flashcard set' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[Flashcards] Error deleting flashcard set:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete flashcard set',
    });
  }
});

// GET /api/flashcards/:flashcardId/export - Export flashcard set as CSV
router.get('/:flashcardId/export', async (req: Request, res: Response) => {
  try {
    const { flashcardId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof flashcardId !== 'string' || !isValidUUID(flashcardId)) {
      return res.status(400).json({ error: 'Invalid flashcardId format' });
    }

    const { data: flashcard, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('id', flashcardId)
      .eq('user_id', userId)
      .single();

    if (error || !flashcard) {
      return res.status(404).json({ error: 'Flashcard set not found' });
    }

    // Parse cards_data using helper
    const flashcards = parseCardsData(flashcard as FlashcardRow);

    if (flashcards.length === 0) {
      return res.status(400).json({ error: 'No flashcards to export' });
    }

    // Helper function to escape CSV fields
    const escapeCSV = (field: string): string => {
      if (field.includes('"') || field.includes(',') || field.includes('\n') || field.includes('\r')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    // Generate CSV content
    const csvRows: string[] = [];
    
    // Add header row
    csvRows.push('Front,Back');
    
    // Add flashcard data
    flashcards.forEach((card: { front: string; back: string }) => {
      const front = escapeCSV(card.front);
      const back = escapeCSV(card.back);
      csvRows.push(`${front},${back}`);
    });

    const csvContent = csvRows.join('\n');
    
    // Create a safe filename from the title
    const safeTitle = flashcard.title
      .replace(/[^a-z0-9]/gi, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
    const filename = `flashcards_${safeTitle}_${new Date().toISOString().split('T')[0]}.csv`;

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    return res.send(csvContent);
  } catch (error) {
    console.error('[Flashcards] Error exporting flashcard set:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to export flashcard set',
    });
  }
});

export default router;

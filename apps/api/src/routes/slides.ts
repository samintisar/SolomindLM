import { Router, Request, Response } from 'express';
import { supabase } from '../config/database.js';
import { scheduleSlideDeckGeneration } from '../utils/jobHelpers.js';
import { SlideDeckGenerationService } from '../services/generation/SlideDeckGenerationService.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const slideDeckService = new SlideDeckGenerationService();

// Configuration constants
const CONFIG = {
  SLIDES: {
    MIN_TITLE_LENGTH: 1,
    MAX_TITLE_LENGTH: 200,
    MAX_CUSTOM_PROMPT_LENGTH: 500,
  },
} as const;

// Type definitions for Supabase responses
interface SlideDeckRow {
  id: string;
  user_id: string;
  notebook_id: string;
  title: string;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  slide_type: 'detailed_deck' | 'presenter_slides';
  slides_data: Record<string, any>[] | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Validation helpers
const SLIDE_TYPES = ['detailed_deck', 'presenter_slides'] as const;
type SlideType = typeof SLIDE_TYPES[number];

const DECK_LENGTHS = ['short', 'default'] as const;
type DeckLength = typeof DECK_LENGTHS[number];

function isValidSlideType(value: string): value is SlideType {
  return SLIDE_TYPES.includes(value as SlideType);
}

function isValidDeckLength(value: string): value is DeckLength {
  return DECK_LENGTHS.includes(value as DeckLength);
}

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function validateDocumentIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every(id => typeof id === 'string' && isValidUUID(id));
}

function validateCustomPrompt(prompt: unknown): prompt is string {
  return typeof prompt === 'string' &&
    prompt.length <= CONFIG.SLIDES.MAX_CUSTOM_PROMPT_LENGTH;
}

function validateTitle(title: unknown): boolean {
  return typeof title === 'string' &&
    title.trim().length >= CONFIG.SLIDES.MIN_TITLE_LENGTH &&
    title.trim().length <= CONFIG.SLIDES.MAX_TITLE_LENGTH;
}

// Helper function to parse slides_data from slide deck row
function parseSlidesData(slideDeck: SlideDeckRow) {
  if (!slideDeck.slides_data) return [];

  // Handle both stored array format
  if (Array.isArray(slideDeck.slides_data)) {
    return slideDeck.slides_data;
  }

  return [];
}

// Helper function to add a job to Graphile Worker
async function addSlideDeckJob(
  payload: {
    slideDeckId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
    slideType: 'detailed_deck' | 'presenter_slides';
    deckLength: 'short' | 'default';
    customPrompt?: string;
  },
  options?: {
    priority?: number;
    queueName?: string;
  }
) {
  try {
    await scheduleSlideDeckGeneration(payload, options);
    console.log(`[Slides] Successfully added slideDeckGeneration job`);
  } catch (error: any) {
    console.error(`[Slides] Failed to add slideDeckGeneration job:`, error);

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

// POST /api/slides - Create slide deck and queue job
router.post('/', authenticate, rateLimiter('slides'), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { notebookId, documentIds, slideType, deckLength, customPrompt } = req.body;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'Slides',
      action: 'create_slide_deck',
      userId,
      notebookId,
      slideType,
      deckLength,
      customPrompt,
    }));

    // Validation: notebookId
    if (typeof notebookId !== 'string' || !isValidUUID(notebookId)) {
      return res.status(400).json({ error: 'Invalid notebookId format' });
    }

    // Validation: slideType
    if (typeof slideType !== 'string' || !isValidSlideType(slideType)) {
      return res.status(400).json({ error: 'slideType must be detailed_deck or presenter_slides' });
    }

    // Validation: deckLength
    if (typeof deckLength !== 'string' || !isValidDeckLength(deckLength)) {
      return res.status(400).json({ error: 'deckLength must be short or default' });
    }

    // Validation: documentIds
    if (!validateDocumentIds(documentIds)) {
      return res.status(400).json({
        error: `documentIds must be a non-empty array of valid UUIDs`
      });
    }

    // Validation: customPrompt (optional)
    if (customPrompt !== undefined && !validateCustomPrompt(customPrompt)) {
      return res.status(400).json({
        error: `customPrompt must be a string with max ${CONFIG.SLIDES.MAX_CUSTOM_PROMPT_LENGTH} characters`
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

    // Generate a unique slide deck ID
    const slideDeckId = crypto.randomUUID();

    // Create slide deck entry with generating status
    const title = 'Slide Deck';

    // Build metadata object
    const metadata: Record<string, any> = {
      documentIds,
      slideType,
      deckLength,
      phase: 'generating',
      createdAt: new Date().toISOString(),
    };
    if (customPrompt !== undefined) {
      metadata.customPrompt = customPrompt;
    }

    const { data: slideDeck, error: slideDeckError } = await supabase
      .from('slide_decks')
      .insert({
        id: slideDeckId,
        user_id: userId,
        notebook_id: notebookId,
        title,
        status: 'generating',
        slide_type: slideType,
        slides_data: [], // Empty array initially
        metadata,
      })
      .select()
      .single();

    if (slideDeckError || !slideDeck) {
      console.error('[Slides] Error creating slide deck entry:', slideDeckError);
      return res.status(500).json({ error: 'Failed to create slide deck entry' });
    }

    // Queue the slide deck generation job
    await addSlideDeckJob({
      slideDeckId,
      userId,
      notebookId,
      documentIds,
      slideType,
      deckLength,
      customPrompt,
    });

    // Format response
    const slides = parseSlidesData(slideDeck as SlideDeckRow);
    return res.status(201).json({
      slideDeckId,
      status: 'generating',
      slideDeck: {
        id: slideDeck.id,
        title: slideDeck.title,
        slides,
        slideType: slideDeck.slide_type,
        status: slideDeck.status,
        metadata: slideDeck.metadata,
        created_at: slideDeck.created_at,
        updated_at: slideDeck.updated_at,
      },
    });
  } catch (error) {
    console.error('[Slides] Error creating slide deck:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create slide deck',
    });
  }
});

// GET /api/slides/notebook/:notebookId - Get all slide decks for a notebook
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

    const { data: slideDecks, error } = await supabase
      .from('slide_decks')
      .select('*')
      .eq('notebook_id', notebookId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Slides] Error fetching slide decks:', error);
      return res.status(500).json({ error: 'Failed to fetch slide decks' });
    }

    const result = (slideDecks || []).map((slideDeck: SlideDeckRow) => ({
      id: slideDeck.id,
      title: slideDeck.title,
      slides: parseSlidesData(slideDeck),
      slideType: slideDeck.slide_type,
      status: slideDeck.status,
      metadata: slideDeck.metadata,
      created_at: slideDeck.created_at,
      updated_at: slideDeck.updated_at,
    }));

    return res.json(result);
  } catch (error) {
    console.error('[Slides] Error fetching slide decks:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch slide decks',
    });
  }
});

// GET /api/slides/:slideDeckId - Get slide deck by ID
router.get('/:slideDeckId', async (req: Request, res: Response) => {
  try {
    const { slideDeckId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof slideDeckId !== 'string' || !isValidUUID(slideDeckId)) {
      return res.status(400).json({ error: 'Invalid slideDeckId format' });
    }

    const { data: slideDeck, error } = await supabase
      .from('slide_decks')
      .select('*')
      .eq('id', slideDeckId)
      .eq('user_id', userId)
      .single();

    if (error || !slideDeck) {
      return res.status(404).json({ error: 'Slide deck not found' });
    }

    const slides = parseSlidesData(slideDeck as SlideDeckRow);

    return res.json({
      id: slideDeck.id,
      title: slideDeck.title,
      slides,
      slideType: slideDeck.slide_type,
      status: slideDeck.status,
      metadata: slideDeck.metadata,
      created_at: slideDeck.created_at,
      updated_at: slideDeck.updated_at,
    });
  } catch (error) {
    console.error('[Slides] Error fetching slide deck:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch slide deck',
    });
  }
});

// PATCH /api/slides/:slideDeckId - Rename a slide deck
router.patch('/:slideDeckId', async (req: Request, res: Response) => {
  try {
    const { slideDeckId } = req.params;
    const { title } = req.body;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof slideDeckId !== 'string' || !isValidUUID(slideDeckId)) {
      return res.status(400).json({ error: 'Invalid slideDeckId format' });
    }

    if (!validateTitle(title)) {
      return res.status(400).json({
        error: `title must be between ${CONFIG.SLIDES.MIN_TITLE_LENGTH} and ${CONFIG.SLIDES.MAX_TITLE_LENGTH} characters`
      });
    }

    // Verify user owns the slide deck
    const { data: slideDeck, error: fetchError } = await supabase
      .from('slide_decks')
      .select('user_id')
      .eq('id', slideDeckId)
      .single();

    if (fetchError || !slideDeck) {
      return res.status(404).json({ error: 'Slide deck not found' });
    }

    if (slideDeck.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const trimmedTitle = title.trim();
    const { error: updateError } = await supabase
      .from('slide_decks')
      .update({ title: trimmedTitle, updated_at: new Date().toISOString() })
      .eq('id', slideDeckId);

    if (updateError) {
      console.error('[Slides] Error renaming slide deck:', updateError);
      return res.status(500).json({ error: 'Failed to rename slide deck' });
    }

    return res.json({ success: true, title: trimmedTitle });
  } catch (error) {
    console.error('[Slides] Error renaming slide deck:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to rename slide deck',
    });
  }
});

// DELETE /api/slides/:slideDeckId - Delete a slide deck
router.delete('/:slideDeckId', async (req: Request, res: Response) => {
  try {
    const { slideDeckId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof slideDeckId !== 'string' || !isValidUUID(slideDeckId)) {
      return res.status(400).json({ error: 'Invalid slideDeckId format' });
    }

    // Verify user owns the slide deck
    const { data: slideDeck, error: fetchError } = await supabase
      .from('slide_decks')
      .select('user_id')
      .eq('id', slideDeckId)
      .single();

    if (fetchError || !slideDeck) {
      return res.status(404).json({ error: 'Slide deck not found' });
    }

    if (slideDeck.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error: deleteError } = await supabase
      .from('slide_decks')
      .delete()
      .eq('id', slideDeckId);

    if (deleteError) {
      console.error('[Slides] Error deleting slide deck:', deleteError);
      return res.status(500).json({ error: 'Failed to delete slide deck' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[Slides] Error deleting slide deck:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete slide deck',
    });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { supabase } from '../config/database.js';
import { scheduleSpreadsheetGeneration } from '../utils/jobHelpers.js';
import { SpreadsheetGenerationService } from '../services/generation/SpreadsheetGenerationService.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const spreadsheetService = new SpreadsheetGenerationService();

// Configuration constants
const CONFIG = {
  SPREADSHEET: {
    MIN_TITLE_LENGTH: 1,
    MAX_TITLE_LENGTH: 200,
    VALID_SPREADSHEET_TYPES: [
      'data_extraction',
      'comparison_table',
      'timeline',
      'financial_summary',
      'custom',
    ] as const,
  },
} as const;

// Type definitions for Supabase responses
interface SpreadsheetRow {
  id: string;
  user_id: string;
  notebook_id: string;
  title: string;
  data: {
    content: string;
  };
  status: 'draft' | 'generating' | 'completed' | 'failed';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Validation helpers
type SpreadsheetType = typeof CONFIG.SPREADSHEET.VALID_SPREADSHEET_TYPES[number];

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function isValidSpreadsheetType(value: string): value is SpreadsheetType {
  return CONFIG.SPREADSHEET.VALID_SPREADSHEET_TYPES.includes(value as SpreadsheetType);
}

function validateDocumentIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every(id => typeof id === 'string' && isValidUUID(id));
}

function validateTitle(title: unknown): boolean {
  return typeof title === 'string' &&
    title.trim().length >= CONFIG.SPREADSHEET.MIN_TITLE_LENGTH &&
    title.trim().length <= CONFIG.SPREADSHEET.MAX_TITLE_LENGTH;
}

// Helper function to add a job to Graphile Worker using the SDK
async function addSpreadsheetJob(
  payload: {
    spreadsheetId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
    spreadsheetType: string;
    customPrompt?: string;
  },
  options?: {
    priority?: number;
    queueName?: string;
  }
) {
  try {
    await scheduleSpreadsheetGeneration(payload, options);
    console.log(`[Spreadsheets] Successfully added spreadsheetGeneration job`);
  } catch (error: any) {
    console.error(`[Spreadsheets] Failed to add spreadsheetGeneration job:`, error);

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

// POST /api/spreadsheets - Create spreadsheet and queue job
router.post('/', authenticate, rateLimiter('spreadsheet'), async (req: Request, res: Response) => {
  try {
    const { notebookId, documentIds, spreadsheetType, customPrompt } = req.body;
    const userId = req.user!.id;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'Spreadsheets',
      action: 'create_spreadsheet',
      userId,
      notebookId,
      spreadsheetType,
    }));

    // Validation: notebookId
    if (typeof notebookId !== 'string' || !isValidUUID(notebookId)) {
      return res.status(400).json({ error: 'Invalid notebookId format' });
    }

    // Validation: spreadsheetType
    if (typeof spreadsheetType !== 'string' || !isValidSpreadsheetType(spreadsheetType)) {
      return res.status(400).json({
        error: `spreadsheetType must be one of: ${CONFIG.SPREADSHEET.VALID_SPREADSHEET_TYPES.join(', ')}`
      });
    }

    // Validation: documentIds
    if (!validateDocumentIds(documentIds)) {
      return res.status(400).json({
        error: `documentIds must be a non-empty array of valid UUIDs`
      });
    }

    // Validation: customPrompt (optional)
    if (customPrompt !== undefined && typeof customPrompt !== 'string') {
      return res.status(400).json({ error: 'customPrompt must be a string' });
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

    // Generate a unique spreadsheet ID
    const spreadsheetId = crypto.randomUUID();

    // Create spreadsheet entry with generating status
    const title = 'Spreadsheet';
    const { data: spreadsheet, error: spreadsheetError } = await supabase
      .from('spreadsheets')
      .insert({
        id: spreadsheetId,
        user_id: userId,
        notebook_id: notebookId,
        title,
        data: {
          content: '',
        },
        status: 'generating',
        metadata: {
          spreadsheetType,
          documentIds,
          phase: 'generating',
          createdAt: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (spreadsheetError || !spreadsheet) {
      console.error('[Spreadsheets] Error creating spreadsheet:', spreadsheetError);
      return res.status(500).json({ error: 'Failed to create spreadsheet' });
    }

    // Queue the spreadsheet generation job
    await addSpreadsheetJob({
      spreadsheetId,
      userId,
      notebookId,
      documentIds,
      spreadsheetType,
      customPrompt,
    });

    return res.status(201).json({
      spreadsheetId,
      status: 'generating',
      spreadsheet,
    });
  } catch (error) {
    console.error('[Spreadsheets] Error creating spreadsheet:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create spreadsheet',
    });
  }
});

// GET /api/spreadsheets/notebook/:notebookId - Get all spreadsheets for a notebook
// MUST come before /:spreadsheetId route to avoid route conflicts
router.get('/notebook/:notebookId', authenticate, async (req: Request, res: Response) => {
  try {
    const { notebookId } = req.params;
    const userId = req.user!.id;

    if (typeof notebookId !== 'string' || !isValidUUID(notebookId)) {
      return res.status(400).json({ error: 'Invalid notebookId format' });
    }

    const { data: spreadsheets, error } = await supabase
      .from('spreadsheets')
      .select('*')
      .eq('notebook_id', notebookId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Spreadsheets] Error fetching spreadsheets:', error);
      return res.status(500).json({ error: 'Failed to fetch spreadsheets' });
    }

    // Map spreadsheets to extract content from data.content
    const mappedSpreadsheets = (spreadsheets || []).map((spreadsheet) => ({
      id: spreadsheet.id,
      title: spreadsheet.title,
      content: spreadsheet.data?.content || '',
      status: spreadsheet.status,
      metadata: spreadsheet.metadata,
      created_at: spreadsheet.created_at,
      updated_at: spreadsheet.updated_at,
    }));

    return res.json(mappedSpreadsheets);
  } catch (error) {
    console.error('[Spreadsheets] Error fetching spreadsheets:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch spreadsheets',
    });
  }
});

// GET /api/spreadsheets/:spreadsheetId - Get spreadsheet status and content
// MUST come after /notebook/:notebookId to avoid route conflicts
router.get('/:spreadsheetId', authenticate, async (req: Request, res: Response) => {
  try {
    const { spreadsheetId } = req.params;
    const userId = req.user!.id;

    if (typeof spreadsheetId !== 'string' || !isValidUUID(spreadsheetId)) {
      return res.status(400).json({ error: 'Invalid spreadsheetId format' });
    }

    const { data: spreadsheet, error } = await supabase
      .from('spreadsheets')
      .select('*')
      .eq('id', spreadsheetId)
      .eq('user_id', userId)
      .single();

    if (error || !spreadsheet) {
      return res.status(404).json({ error: 'Spreadsheet not found' });
    }

    return res.json({
      id: spreadsheet.id,
      title: spreadsheet.title,
      content: spreadsheet.data?.content || '',
      status: spreadsheet.status,
      metadata: spreadsheet.metadata,
      created_at: spreadsheet.created_at,
      updated_at: spreadsheet.updated_at,
    });
  } catch (error) {
    console.error('[Spreadsheets] Error fetching spreadsheet:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch spreadsheet',
    });
  }
});

// PATCH /api/spreadsheets/:spreadsheetId - Rename a spreadsheet
router.patch('/:spreadsheetId', authenticate, async (req: Request, res: Response) => {
  try {
    const { spreadsheetId } = req.params;
    const { title } = req.body;
    const userId = req.user!.id;

    if (typeof spreadsheetId !== 'string' || !isValidUUID(spreadsheetId)) {
      return res.status(400).json({ error: 'Invalid spreadsheetId format' });
    }

    if (!validateTitle(title)) {
      return res.status(400).json({
        error: `title must be between ${CONFIG.SPREADSHEET.MIN_TITLE_LENGTH} and ${CONFIG.SPREADSHEET.MAX_TITLE_LENGTH} characters`
      });
    }

    // Verify user owns the spreadsheet
    const { data: spreadsheet, error: fetchError } = await supabase
      .from('spreadsheets')
      .select('user_id')
      .eq('id', spreadsheetId)
      .single();

    if (fetchError || !spreadsheet) {
      return res.status(404).json({ error: 'Spreadsheet not found' });
    }

    if (spreadsheet.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const trimmedTitle = title.trim();
    const { error: updateError } = await supabase
      .from('spreadsheets')
      .update({ title: trimmedTitle, updated_at: new Date().toISOString() })
      .eq('id', spreadsheetId);

    if (updateError) {
      console.error('[Spreadsheets] Error renaming spreadsheet:', updateError);
      return res.status(500).json({ error: 'Failed to rename spreadsheet' });
    }

    return res.json({ success: true, title: trimmedTitle });
  } catch (error) {
    console.error('[Spreadsheets] Error renaming spreadsheet:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to rename spreadsheet',
    });
  }
});

// DELETE /api/spreadsheets/:spreadsheetId - Delete a spreadsheet
router.delete('/:spreadsheetId', authenticate, async (req: Request, res: Response) => {
  try {
    const { spreadsheetId } = req.params;
    const userId = req.user!.id;

    if (typeof spreadsheetId !== 'string' || !isValidUUID(spreadsheetId)) {
      return res.status(400).json({ error: 'Invalid spreadsheetId format' });
    }

    // Verify user owns the spreadsheet
    const { data: spreadsheet, error: fetchError } = await supabase
      .from('spreadsheets')
      .select('user_id')
      .eq('id', spreadsheetId)
      .single();

    if (fetchError || !spreadsheet) {
      return res.status(404).json({ error: 'Spreadsheet not found' });
    }

    if (spreadsheet.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error: deleteError } = await supabase
      .from('spreadsheets')
      .delete()
      .eq('id', spreadsheetId);

    if (deleteError) {
      console.error('[Spreadsheets] Error deleting spreadsheet:', deleteError);
      return res.status(500).json({ error: 'Failed to delete spreadsheet' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[Spreadsheets] Error deleting spreadsheet:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete spreadsheet',
    });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { supabase } from '../config/database.js';
import { scheduleReportGeneration } from '../utils/jobHelpers.js';
import { ReportGenerationService } from '../services/generation/ReportGenerationService.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const reportService = new ReportGenerationService();

// Configuration constants
const CONFIG = {
  REPORT: {
    MIN_TITLE_LENGTH: 1,
    MAX_TITLE_LENGTH: 200,
    VALID_REPORT_TYPES: [
      'briefing',
      'study_guide',
      'blog_post',
      'summary',
      'technical_report',
      'concept_explainer',
      'methodology_overview',
      'custom',
    ] as const,
  },
} as const;

// Type definitions for Supabase responses
interface NoteRow {
  id: string;
  user_id: string;
  notebook_id: string;
  title: string;
  content: string;
  note_type: 'manual' | 'report';
  status: 'draft' | 'generating' | 'completed' | 'failed';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Validation helpers
type ReportType = typeof CONFIG.REPORT.VALID_REPORT_TYPES[number];

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function isValidReportType(value: string): value is ReportType {
  return CONFIG.REPORT.VALID_REPORT_TYPES.includes(value as ReportType);
}

function validateDocumentIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every(id => typeof id === 'string' && isValidUUID(id));
}

function validateTitle(title: unknown): boolean {
  return typeof title === 'string' &&
    title.trim().length >= CONFIG.REPORT.MIN_TITLE_LENGTH &&
    title.trim().length <= CONFIG.REPORT.MAX_TITLE_LENGTH;
}

// Helper function to add a job to Graphile Worker using the SDK
async function addReportJob(
  payload: {
    reportId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
    reportType: string;
    customPrompt?: string;
  },
  options?: {
    priority?: number;
    queueName?: string;
  }
) {
  try {
    await scheduleReportGeneration(payload, options);
    console.log(`[Reports] Successfully added reportGeneration job`);
  } catch (error: any) {
    console.error(`[Reports] Failed to add reportGeneration job:`, error);

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

// POST /api/reports - Create report and queue job
router.post('/', authenticate, rateLimiter('report'), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { noteId, documentIds, reportType, customPrompt } = req.body;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'Reports',
      action: 'create_report',
      userId,
      noteId,
      reportType,
    }));

    // Validation: noteId
    if (typeof noteId !== 'string' || !isValidUUID(noteId)) {
      return res.status(400).json({ error: 'Invalid noteId format' });
    }

    // Validation: reportType
    if (typeof reportType !== 'string' || !isValidReportType(reportType)) {
      return res.status(400).json({
        error: `reportType must be one of: ${CONFIG.REPORT.VALID_REPORT_TYPES.join(', ')}`
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
      .eq('id', noteId)
      .single();

    if (notebookError || !notebook) {
      return res.status(404).json({ error: 'Notebook not found' });
    }

    if (notebook.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Generate a unique report ID
    const reportId = crypto.randomUUID();

    // Create note entry with generating status
    // Initial title is a simple placeholder - AI will generate a descriptive title later
    const title = 'Report';
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .insert({
        id: reportId,
        user_id: userId,
        notebook_id: noteId,
        title,
        content: '',
        note_type: 'report',
        status: 'generating',
        metadata: {
          reportType,
          documentIds,
          phase: 'generating',
          createdAt: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (noteError || !note) {
      console.error('[Reports] Error creating note:', noteError);
      return res.status(500).json({ error: 'Failed to create report note' });
    }

    // Queue the report generation job
    await addReportJob({
      reportId,
      userId,
      notebookId: noteId,
      documentIds,
      reportType,
      customPrompt,
    });

    return res.status(201).json({
      reportId,
      status: 'generating',
      note,
    });
  } catch (error) {
    console.error('[Reports] Error creating report:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create report',
    });
  }
});

// GET /api/reports/notebook/:notebookId - Get all reports for a notebook
// MUST come before /:reportId route to avoid route conflicts
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

    const { data: notes, error } = await supabase
      .from('notes')
      .select('*')
      .eq('notebook_id', notebookId)
      .eq('user_id', userId)
      .eq('note_type', 'report')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Reports] Error fetching reports:', error);
      return res.status(500).json({ error: 'Failed to fetch reports' });
    }

    return res.json(notes || []);
  } catch (error) {
    console.error('[Reports] Error fetching reports:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch reports',
    });
  }
});

// GET /api/reports/:reportId - Get report status and content
// MUST come after /notebook/:notebookId to avoid route conflicts
router.get('/:reportId', async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof reportId !== 'string' || !isValidUUID(reportId)) {
      return res.status(400).json({ error: 'Invalid reportId format' });
    }

    const { data: note, error } = await supabase
      .from('notes')
      .select('*')
      .eq('id', reportId)
      .eq('user_id', userId)
      .single();

    if (error || !note) {
      return res.status(404).json({ error: 'Report not found' });
    }

    return res.json({
      id: note.id,
      title: note.title,
      content: note.content,
      status: note.status,
      metadata: note.metadata,
      created_at: note.created_at,
      updated_at: note.updated_at,
    });
  } catch (error) {
    console.error('[Reports] Error fetching report:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch report',
    });
  }
});

// PATCH /api/reports/:reportId - Rename a report
router.patch('/:reportId', async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const { title } = req.body;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof reportId !== 'string' || !isValidUUID(reportId)) {
      return res.status(400).json({ error: 'Invalid reportId format' });
    }

    if (!validateTitle(title)) {
      return res.status(400).json({
        error: `title must be between ${CONFIG.REPORT.MIN_TITLE_LENGTH} and ${CONFIG.REPORT.MAX_TITLE_LENGTH} characters`
      });
    }

    // Verify user owns the note
    const { data: note, error: fetchError } = await supabase
      .from('notes')
      .select('user_id')
      .eq('id', reportId)
      .single();

    if (fetchError || !note) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (note.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const trimmedTitle = title.trim();
    const { error: updateError } = await supabase
      .from('notes')
      .update({ title: trimmedTitle, updated_at: new Date().toISOString() })
      .eq('id', reportId);

    if (updateError) {
      console.error('[Reports] Error renaming report:', updateError);
      return res.status(500).json({ error: 'Failed to rename report' });
    }

    return res.json({ success: true, title: trimmedTitle });
  } catch (error) {
    console.error('[Reports] Error renaming report:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to rename report',
    });
  }
});

// DELETE /api/reports/:reportId - Delete a report
router.delete('/:reportId', async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof reportId !== 'string' || !isValidUUID(reportId)) {
      return res.status(400).json({ error: 'Invalid reportId format' });
    }

    // Verify user owns the note
    const { data: note, error: fetchError } = await supabase
      .from('notes')
      .select('user_id')
      .eq('id', reportId)
      .single();

    if (fetchError || !note) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (note.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error: deleteError } = await supabase
      .from('notes')
      .delete()
      .eq('id', reportId);

    if (deleteError) {
      console.error('[Reports] Error deleting report:', deleteError);
      return res.status(500).json({ error: 'Failed to delete report' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[Reports] Error deleting report:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete report',
    });
  }
});

export default router;

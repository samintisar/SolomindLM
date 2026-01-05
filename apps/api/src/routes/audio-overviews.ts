import { Router, Request, Response } from 'express';
import { supabase } from '../config/database.js';
import { scheduleAudioOverviewGeneration } from '../utils/jobHelpers.js';
import { AudioOverviewGenerationService } from '../services/generation/AudioOverviewGenerationService.js';
import { SupabaseStorageService } from '../services/storage/SupabaseStorageService.js';

const router = Router();
const audioOverviewService = new AudioOverviewGenerationService();
const storageService = new SupabaseStorageService();

// Configuration constants
const CONFIG = {
  AUDIO_OVERVIEW: {
    MIN_TITLE_LENGTH: 1,
    MAX_TITLE_LENGTH: 200,
    MAX_DOCUMENTS: 10,
    VALID_AUDIO_TYPES: [
      'deep_dive',
      'brief',
      'critique',
      'debate',
    ] as const,
    VALID_LENGTHS: [
      'short',
      'default',
      'long',
    ] as const,
  },
} as const;

// Type definitions for Supabase responses
interface AudioOverviewRow {
  id: string;
  user_id: string;
  notebook_id: string;
  title: string;
  transcript: string | null;
  status: 'pending' | 'generating' | 'synthesizing' | 'completed' | 'failed';
  audio_type: string;
  audio_url: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Validation helpers
type AudioType = typeof CONFIG.AUDIO_OVERVIEW.VALID_AUDIO_TYPES[number];
type LengthType = typeof CONFIG.AUDIO_OVERVIEW.VALID_LENGTHS[number];

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function isValidAudioType(value: string): value is AudioType {
  return CONFIG.AUDIO_OVERVIEW.VALID_AUDIO_TYPES.includes(value as AudioType);
}

function isValidLength(value: string): value is LengthType {
  return CONFIG.AUDIO_OVERVIEW.VALID_LENGTHS.includes(value as LengthType);
}

function validateDocumentIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= CONFIG.AUDIO_OVERVIEW.MAX_DOCUMENTS &&
    ids.every(id => typeof id === 'string' && isValidUUID(id));
}

// Helper function to add a job to Graphile Worker using the SDK
async function addAudioOverviewJob(
  payload: {
    audioOverviewId: string;
    userId: string;
    notebookId: string;
    documentIds: string[];
  },
  options?: {
    priority?: number;
    queueName?: string;
  }
) {
  try {
    await scheduleAudioOverviewGeneration(payload, options);
    console.log(`[AudioOverviews] Successfully added audioOverviewGeneration job`);
  } catch (error: any) {
    console.error(`[AudioOverviews] Failed to add audioOverviewGeneration job:`, error);

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

// POST /api/audio-overviews - Create audio overview and queue job
router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, notebookId, documentIds, audioType, length, focus } = req.body;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'AudioOverviews',
      action: 'create_audio_overview',
      userId,
      notebookId,
      audioType,
      length,
    }));

    // Validation: userId and notebookId
    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }
    if (typeof notebookId !== 'string' || !isValidUUID(notebookId)) {
      return res.status(400).json({ error: 'Invalid notebookId format' });
    }

    // Validation: documentIds
    if (!validateDocumentIds(documentIds)) {
      return res.status(400).json({
        error: `documentIds must be an array of 1-${CONFIG.AUDIO_OVERVIEW.MAX_DOCUMENTS} valid UUIDs`
      });
    }

    // Validation: audioType
    if (typeof audioType !== 'string' || !isValidAudioType(audioType)) {
      return res.status(400).json({
        error: `audioType must be one of: ${CONFIG.AUDIO_OVERVIEW.VALID_AUDIO_TYPES.join(', ')}`
      });
    }

    // Validation: length
    if (typeof length !== 'string' || !isValidLength(length)) {
      return res.status(400).json({
        error: `length must be one of: ${CONFIG.AUDIO_OVERVIEW.VALID_LENGTHS.join(', ')}`
      });
    }

    // Validation: focus (optional)
    if (focus !== undefined && typeof focus !== 'string') {
      return res.status(400).json({ error: 'focus must be a string' });
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

    // Create audio overview record with draft status
    const audioOverviewId = await audioOverviewService.createAudioOverview(userId, notebookId, {
      audioType,
      length,
      focus,
      documentIds,
    });

    // Queue the audio overview generation job
    await addAudioOverviewJob({
      audioOverviewId,
      userId,
      notebookId,
      documentIds,
      audioType,
      length,
      focus,
    });

    return res.status(201).json({
      audioOverviewId,
      status: 'draft',
    });
  } catch (error) {
    console.error('[AudioOverviews] Error creating audio overview:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create audio overview',
    });
  }
});

// GET /api/audio-overviews/notebook/:notebookId - Get all audio overviews for a notebook
// MUST come before /:audioOverviewId route to avoid route conflicts
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

    const { data: audioOverviews, error } = await supabase
      .from('audio_overviews')
      .select('*')
      .eq('notebook_id', notebookId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AudioOverviews] Error fetching audio overviews:', error);
      return res.status(500).json({ error: 'Failed to fetch audio overviews' });
    }

    return res.json(audioOverviews || []);
  } catch (error) {
    console.error('[AudioOverviews] Error fetching audio overviews:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch audio overviews',
    });
  }
});

// GET /api/audio-overviews/:audioOverviewId - Get audio overview status and content
// MUST come after /notebook/:notebookId to avoid route conflicts
router.get('/:audioOverviewId', async (req: Request, res: Response) => {
  try {
    const { audioOverviewId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof audioOverviewId !== 'string' || !isValidUUID(audioOverviewId)) {
      return res.status(400).json({ error: 'Invalid audioOverviewId format' });
    }

    const { data: audioOverview, error } = await supabase
      .from('audio_overviews')
      .select('*')
      .eq('id', audioOverviewId)
      .eq('user_id', userId)
      .single();

    if (error || !audioOverview) {
      return res.status(404).json({ error: 'Audio overview not found' });
    }

    return res.json(audioOverview);
  } catch (error) {
    console.error('[AudioOverviews] Error fetching audio overview:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch audio overview',
    });
  }
});

// PATCH /api/audio-overviews/:audioOverviewId - Rename an audio overview
router.patch('/:audioOverviewId', async (req: Request, res: Response) => {
  try {
    const { audioOverviewId } = req.params;
    const { title } = req.body;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof audioOverviewId !== 'string' || !isValidUUID(audioOverviewId)) {
      return res.status(400).json({ error: 'Invalid audioOverviewId format' });
    }

    // Validate title
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < CONFIG.AUDIO_OVERVIEW.MIN_TITLE_LENGTH ||
        trimmedTitle.length > CONFIG.AUDIO_OVERVIEW.MAX_TITLE_LENGTH) {
      return res.status(400).json({
        error: `title must be between ${CONFIG.AUDIO_OVERVIEW.MIN_TITLE_LENGTH} and ${CONFIG.AUDIO_OVERVIEW.MAX_TITLE_LENGTH} characters`
      });
    }

    // Verify user owns the audio overview
    const { data: audioOverview, error: fetchError } = await supabase
      .from('audio_overviews')
      .select('user_id')
      .eq('id', audioOverviewId)
      .single();

    if (fetchError || !audioOverview) {
      return res.status(404).json({ error: 'Audio overview not found' });
    }

    if (audioOverview.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update title
    const { error: updateError } = await supabase
      .from('audio_overviews')
      .update({ title: trimmedTitle, updated_at: new Date().toISOString() })
      .eq('id', audioOverviewId);

    if (updateError) {
      console.error('[AudioOverviews] Error renaming audio overview:', updateError);
      return res.status(500).json({ error: 'Failed to rename audio overview' });
    }

    return res.json({ success: true, title: trimmedTitle });
  } catch (error) {
    console.error('[AudioOverviews] Error renaming audio overview:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to rename audio overview',
    });
  }
});

// DELETE /api/audio-overviews/:audioOverviewId - Delete an audio overview
router.delete('/:audioOverviewId', async (req: Request, res: Response) => {
  try {
    const { audioOverviewId } = req.params;
    const userId = req.query.userId as string;

    if (typeof userId !== 'string' || !isValidUUID(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    if (typeof audioOverviewId !== 'string' || !isValidUUID(audioOverviewId)) {
      return res.status(400).json({ error: 'Invalid audioOverviewId format' });
    }

    // Verify user owns the audio overview
    const { data: audioOverview, error: fetchError } = await supabase
      .from('audio_overviews')
      .select('user_id, audio_url')
      .eq('id', audioOverviewId)
      .single();

    if (fetchError || !audioOverview) {
      return res.status(404).json({ error: 'Audio overview not found' });
    }

    if (audioOverview.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete audio file from storage if exists
    if (audioOverview.audio_url) {
      try {
        await storageService.deleteAudioFile(audioOverview.audio_url);
      } catch (storageError) {
        console.error('[AudioOverviews] Warning: Failed to delete audio file:', storageError);
        // Continue with DB deletion even if storage deletion fails
      }
    }

    // Delete database record
    const { error: deleteError } = await supabase
      .from('audio_overviews')
      .delete()
      .eq('id', audioOverviewId);

    if (deleteError) {
      console.error('[AudioOverviews] Error deleting audio overview:', deleteError);
      return res.status(500).json({ error: 'Failed to delete audio overview' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[AudioOverviews] Error deleting audio overview:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete audio overview',
    });
  }
});

export default router;
